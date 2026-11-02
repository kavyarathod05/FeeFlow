import { Router } from "express";
import { param } from "../../utils/params.js";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { ok, fail } from "../../utils/response.js";
import { calculateProRataRefund, refundToNumbers } from "../../services/refundCalculation.js";
import { toNumber } from "../../utils/money.js";

export const refundsRouter = Router();
refundsRouter.use(requireAuth, requireRole("ACCOUNTS"));

refundsRouter.post("/calculate", async (req, res, next) => {
  try {
    const body = z
      .object({
        studentId: z.string(),
        withdrawalDate: z.string(),
      })
      .parse(req.body);

    const student = await prisma.student.findUnique({
      where: { id: body.studentId },
      include: {
        feePlans: { where: { isActive: true }, include: { discounts: true, instalments: true } },
        refundRequests: { where: { status: { in: ["APPROVED", "PROCESSED"] } } },
      },
    });
    if (!student) return fail(res, "Student not found", 404);
    const plan = student.feePlans[0];
    if (!plan) return fail(res, "No active fee plan", 404);
    if (!student.courseStartDate || !student.courseEndDate) {
      return fail(res, "Missing course dates — cannot calculate refund", 400);
    }

    const policy = await prisma.refundPolicy.findFirst({ where: { isActive: true } });
    if (!policy) return fail(res, "No active refund policy configured", 400);

    const discountTotal = plan.discounts.reduce((s, d) => s + toNumber(d.amount), 0);
    const totalPaid = plan.instalments.reduce((s, i) => s + toNumber(i.amountPaid), 0);
    const previouslyRefunded = student.refundRequests.reduce(
      (s, r) => s + toNumber(r.calculatedRefund),
      0,
    );

    const result = calculateProRataRefund({
      baseFee: toNumber(plan.baseFee),
      discountTotal,
      nonRefundableAmount: toNumber(policy.nonRefundableAmount),
      totalPaid,
      previouslyRefunded,
      courseStartDate: student.courseStartDate,
      courseEndDate: student.courseEndDate,
      withdrawalDate: new Date(body.withdrawalDate),
      processingDays: policy.processingDays,
    });

    return ok(res, {
      policy: {
        id: policy.id,
        version: policy.version,
        name: policy.name,
        isIllustrative: policy.isIllustrative,
        formulaDescription: policy.formulaDescription,
        processingDays: policy.processingDays,
        disclaimer:
          "Illustrative MVP assumption — not the client's approved written refund policy. Processing deadline is a visible obligation, not a legal compliance guarantee by the app.",
      },
      student: {
        id: student.id,
        studentCode: student.studentCode,
        name: student.name,
        courseStartDate: student.courseStartDate,
        courseEndDate: student.courseEndDate,
      },
      calculation: refundToNumbers(result),
    });
  } catch (e) {
    return next(e);
  }
});

refundsRouter.post("/", async (req, res, next) => {
  try {
    const body = z
      .object({
        studentId: z.string(),
        withdrawalDate: z.string(),
      })
      .parse(req.body);

    const existing = await prisma.refundRequest.findFirst({
      where: {
        studentId: body.studentId,
        status: { in: ["CALCULATED", "PENDING_REVIEW", "APPROVED"] },
      },
    });
    if (existing) return fail(res, "Refund already requested for this student", 400);

    const calcRes = await (async () => {
      // reuse calculate endpoint logic via internal call pattern
      req.body = body;
      return null;
    })();
    void calcRes;

    const student = await prisma.student.findUniqueOrThrow({
      where: { id: body.studentId },
      include: {
        feePlans: { where: { isActive: true }, include: { discounts: true, instalments: true } },
        refundRequests: { where: { status: { in: ["APPROVED", "PROCESSED"] } } },
      },
    });
    const plan = student.feePlans[0];
    const policy = await prisma.refundPolicy.findFirstOrThrow({ where: { isActive: true } });
    const discountTotal = plan.discounts.reduce((s, d) => s + toNumber(d.amount), 0);
    const totalPaid = plan.instalments.reduce((s, i) => s + toNumber(i.amountPaid), 0);
    const previouslyRefunded = student.refundRequests.reduce(
      (s, r) => s + toNumber(r.calculatedRefund),
      0,
    );
    const result = calculateProRataRefund({
      baseFee: toNumber(plan.baseFee),
      discountTotal,
      nonRefundableAmount: toNumber(policy.nonRefundableAmount),
      totalPaid,
      previouslyRefunded,
      courseStartDate: student.courseStartDate,
      courseEndDate: student.courseEndDate,
      withdrawalDate: new Date(body.withdrawalDate),
      processingDays: policy.processingDays,
    });
    if (!result.ok || !result.processingDeadline) {
      return fail(res, result.error ?? "Refund calculation failed", 400);
    }

    const created = await prisma.refundRequest.create({
      data: {
        studentId: student.id,
        policyId: policy.id,
        withdrawalDate: new Date(body.withdrawalDate),
        courseStartDate: student.courseStartDate,
        courseEndDate: student.courseEndDate,
        baseFee: result.baseFee,
        discountTotal: result.discountTotal,
        eligibleNetFee: result.eligibleNetFee,
        totalPaid: result.totalPaid,
        previouslyRefunded: result.previouslyRefunded,
        totalDays: result.totalDays,
        completedDays: result.completedDays,
        remainingDays: result.remainingDays,
        calculatedRefund: result.calculatedRefund,
        calculationVersion: result.calculationVersion,
        calculationSnapshot: result.snapshot as object,
        status: "PENDING_REVIEW",
        processingDeadline: result.processingDeadline,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "refund.request_created",
        entityType: "RefundRequest",
        entityId: created.id,
        metadata: { calculatedRefund: result.calculatedRefund },
      },
    });

    return ok(res, { ...created, calculatedRefund: toNumber(created.calculatedRefund) }, 201);
  } catch (e) {
    return next(e);
  }
});

refundsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.refundRequest.findUnique({
      where: { id: param(req, "id") },
      include: { student: true, policy: true },
    });
    if (!row) return fail(res, "Refund not found", 404);
    return ok(res, {
      ...row,
      baseFee: toNumber(row.baseFee),
      discountTotal: toNumber(row.discountTotal),
      eligibleNetFee: toNumber(row.eligibleNetFee),
      totalPaid: toNumber(row.totalPaid),
      previouslyRefunded: toNumber(row.previouslyRefunded),
      calculatedRefund: toNumber(row.calculatedRefund),
    });
  } catch (e) {
    return next(e);
  }
});
