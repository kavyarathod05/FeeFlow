import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { ok, fail } from "../../utils/response.js";
import { toNumber } from "../../utils/money.js";
import { cancelRemindersForInstalment } from "../../services/reminderService.js";
import { deriveInstalmentStatus, instalmentRemaining } from "../../services/feeCalculation.js";
import { money, toFixed } from "../../utils/money.js";

export const reconciliationRouter = Router();
reconciliationRouter.use(requireAuth, requireRole("ACCOUNTS"));

reconciliationRouter.get("/", async (_req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        allocations: { include: { instalment: { include: { feePlan: { include: { student: true } } } } } },
        unmatched: true,
        receipts: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok(
      res,
      payments.map((p) => ({
        id: p.id,
        gatewayRef: p.gatewayRef,
        amount: toNumber(p.amount),
        status: p.status,
        reconciliationStatus: p.reconciliationStatus,
        paidAt: p.paidAt,
        unmatched: p.unmatched,
        allocations: p.allocations.map((a) => ({
          instalmentId: a.instalmentId,
          amount: toNumber(a.amount),
          student: a.instalment.feePlan.student.studentCode,
          studentName: a.instalment.feePlan.student.name,
        })),
        receipts: p.receipts.map((r) => r.receiptNo),
      })),
    );
  } catch (e) {
    return next(e);
  }
});

reconciliationRouter.post("/match", async (req, res, next) => {
  try {
    const body = z
      .object({
        unmatchedPaymentId: z.string(),
        instalmentId: z.string(),
      })
      .parse(req.body);

    const unmatched = await prisma.unmatchedPayment.findUnique({
      where: { id: body.unmatchedPaymentId },
      include: { payment: true },
    });
    if (!unmatched || unmatched.resolved) return fail(res, "Unmatched payment not found", 404);

    const result = await prisma.$transaction(async (tx) => {
      const instalment = await tx.instalment.findUniqueOrThrow({
        where: { id: body.instalmentId },
        include: { feePlan: { include: { student: true } } },
      });
      const rem = money(instalmentRemaining(instalment));
      const pay = money(unmatched.payment.amount);
      if (pay.greaterThan(rem)) throw new Error("Payment exceeds instalment outstanding");

      await tx.paymentAllocation.create({
        data: {
          paymentId: unmatched.paymentId,
          instalmentId: body.instalmentId,
          amount: unmatched.payment.amount,
        },
      });
      const newPaid = money(instalment.amountPaid).plus(pay);
      await tx.instalment.update({
        where: { id: body.instalmentId },
        data: {
          amountPaid: toFixed(newPaid),
          status: deriveInstalmentStatus({
            amount: instalment.amount,
            amountPaid: newPaid,
            dueDate: instalment.dueDate,
          }),
        },
      });
      await tx.payment.update({
        where: { id: unmatched.paymentId },
        data: {
          status: "SUCCESS",
          paidAt: new Date(),
          reconciliationStatus: "MATCHED",
        },
      });
      await tx.unmatchedPayment.update({
        where: { id: unmatched.id },
        data: { resolved: true, resolvedAt: new Date(), resolvedBy: req.user!.id },
      });
      await cancelRemindersForInstalment(body.instalmentId, "manual_reconciliation_match", tx);
      return { paymentId: unmatched.paymentId, instalmentId: body.instalmentId };
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "reconciliation.match",
        entityType: "Payment",
        entityId: result.paymentId,
        metadata: result,
      },
    });

    return ok(res, result);
  } catch (e) {
    return next(e);
  }
});

reconciliationRouter.get("/export", async (_req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { status: "SUCCESS" },
      include: {
        allocations: {
          include: { instalment: { include: { feePlan: { include: { student: true } } } } },
        },
        receipts: true,
      },
      orderBy: { paidAt: "asc" },
    });

    // ASSUMPTION: Tally CSV with voucher-like columns for manual import mapping
    const header = [
      "Date",
      "VoucherType",
      "LedgerName",
      "StudentCode",
      "StudentName",
      "Instalment",
      "Amount",
      "GatewayRef",
      "ReceiptNo",
      "Narration",
    ].join(",");

    const lines = payments.flatMap((p) =>
      p.allocations.map((a) => {
        const s = a.instalment.feePlan.student;
        const date = (p.paidAt ?? p.createdAt).toISOString().slice(0, 10);
        const receipt = p.receipts[0]?.receiptNo ?? "";
        return [
          date,
          "Receipt",
          "Fee Collection",
          s.studentCode,
          `"${s.name}"`,
          a.instalment.sequence,
          toNumber(a.amount).toFixed(2),
          p.gatewayRef ?? "",
          receipt,
          `"FeeFlow payment ${p.id}"`,
        ].join(",");
      }),
    );

    const csv = [header, ...lines].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=feeflow-tally-export.csv");
    return res.send(csv);
  } catch (e) {
    return next(e);
  }
});
