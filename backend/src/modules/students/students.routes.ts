import { Router } from "express";
import { param } from "../../utils/params.js";
import { prisma } from "../../config/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { ok, fail } from "../../utils/response.js";
import {
  deriveInstalmentStatus,
  instalmentDaysOverdue,
  instalmentRemaining,
  summariseLedger,
} from "../../services/feeCalculation.js";
import { toNumber } from "../../utils/money.js";

export const studentsRouter = Router();

async function assertParentAccess(parentId: string | undefined, studentId: string) {
  if (!parentId) throw new Error("Forbidden");
  const link = await prisma.parentStudent.findUnique({
    where: { parentId_studentId: { parentId, studentId } },
  });
  if (!link) throw new Error("Forbidden");
}

studentsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const centreId = typeof req.query.centreId === "string" ? req.query.centreId : undefined;
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;

    if (req.user!.role === "PARENT") {
      const links = await prisma.parentStudent.findMany({
        where: { parentId: req.user!.parentId },
        include: {
          student: { include: { centre: true, batch: true, feePlans: { where: { isActive: true } } } },
        },
      });
      return ok(
        res,
        links.map((l) => l.student),
      );
    }

    const students = await prisma.student.findMany({
      where: {
        deletedAt: null,
        centreId,
        batchId,
        OR: q
          ? [
              { name: { contains: q, mode: "insensitive" } },
              { studentCode: { contains: q, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: { centre: true, batch: true },
      orderBy: { studentCode: "asc" },
      take: 200,
    });
    return ok(res, students);
  } catch (e) {
    return next(e);
  }
});

studentsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role === "PARENT") {
      await assertParentAccess(req.user!.parentId, param(req, "id"));
    }
    const student = await prisma.student.findUnique({
      where: { id: param(req, "id") },
      include: { centre: true, batch: true, feePlans: { where: { isActive: true }, include: { discounts: true } } },
    });
    if (!student) return fail(res, "Student not found", 404);
    return ok(res, student);
  } catch (e) {
    return next(e);
  }
});

studentsRouter.get("/:id/ledger", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role === "PARENT") {
      await assertParentAccess(req.user!.parentId, param(req, "id"));
    }
    const student = await prisma.student.findUnique({
      where: { id: param(req, "id") },
      include: {
        centre: true,
        batch: true,
        feePlans: {
          where: { isActive: true },
          include: {
            discounts: true,
            instalments: {
              orderBy: { sequence: "asc" },
              include: {
                allocations: { include: { payment: true } },
                receipts: true,
                reminders: { orderBy: { scheduledFor: "asc" } },
                paymentLinks: { orderBy: { createdAt: "desc" }, take: 3 },
              },
            },
          },
        },
        riskAssessments: { orderBy: { assessedAt: "desc" }, take: 1 },
      },
    });
    if (!student) return fail(res, "Student not found", 404);
    const plan = student.feePlans[0];
    if (!plan) return fail(res, "No active fee plan", 404);

    const summary = summariseLedger(plan.instalments);
    const instalments = plan.instalments.map((inst) => ({
      ...inst,
      amount: toNumber(inst.amount),
      amountPaid: toNumber(inst.amountPaid),
      remaining: toNumber(instalmentRemaining(inst)),
      status: deriveInstalmentStatus(inst),
      daysOverdue: instalmentDaysOverdue(inst),
      briefSnapshotNote: inst.briefSnapshotNote,
      allocations: inst.allocations.map((a) => ({
        ...a,
        amount: toNumber(a.amount),
        payment: { ...a.payment, amount: toNumber(a.payment.amount) },
      })),
      receipts: inst.receipts.map((r) => ({
        ...r,
        taxableAmount: toNumber(r.taxableAmount),
        cgst: toNumber(r.cgst),
        sgst: toNumber(r.sgst),
        totalAmount: toNumber(r.totalAmount),
      })),
      reminders: inst.reminders.map((r) => ({
        ...r,
        outstandingAmount: toNumber(r.outstandingAmount),
      })),
    }));

    // Hide internal risk from parent portal consumers of ledger (accounts still get it)
    const risk =
      req.user!.role === "ACCOUNTS"
        ? student.riskAssessments[0] ?? null
        : undefined;

    return ok(res, {
      student: {
        id: student.id,
        studentCode: student.studentCode,
        name: student.name,
        centre: student.centre,
        batch: student.batch,
        courseStartDate: student.courseStartDate,
        courseEndDate: student.courseEndDate,
      },
      feePlan: {
        id: plan.id,
        name: plan.name,
        baseFee: toNumber(plan.baseFee),
        netFee: toNumber(plan.netFee),
        instalmentCount: plan.instalmentCount,
        discounts: plan.discounts.map((d) => ({ ...d, amount: toNumber(d.amount) })),
      },
      summary,
      instalments,
      risk,
    });
  } catch (e) {
    return next(e);
  }
});

studentsRouter.get(
  "/:id/parent-portal",
  requireAuth,
  requireRole("PARENT"),
  async (req, res, next) => {
    try {
      await assertParentAccess(req.user!.parentId, param(req, "id"));
      const student = await prisma.student.findUniqueOrThrow({
        where: { id: param(req, "id") },
        include: {
          batch: true,
          centre: true,
          feePlans: {
            where: { isActive: true },
            include: {
              instalments: {
                orderBy: { sequence: "asc" },
                include: { receipts: true, reminders: true },
              },
            },
          },
          attendance: { orderBy: { date: "desc" }, take: 60 },
          testScores: { include: { test: true }, orderBy: { createdAt: "desc" }, take: 10 },
          consents: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      const plan = student.feePlans[0];
      if (!plan) return fail(res, "No active fee plan", 404);
      const summary = summariseLedger(plan.instalments);
      const mapped = plan.instalments.map((inst) => ({
        id: inst.id,
        sequence: inst.sequence,
        dueDate: inst.dueDate,
        amount: toNumber(inst.amount),
        amountPaid: toNumber(inst.amountPaid),
        remaining: toNumber(instalmentRemaining(inst)),
        status: deriveInstalmentStatus(inst),
        daysOverdue: instalmentDaysOverdue(inst),
        briefSnapshotNote: inst.briefSnapshotNote,
        receipts: inst.receipts,
        reminders: inst.reminders,
      }));
      const nextDue = mapped
        .filter((row) => row.remaining > 0)
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

      const present = student.attendance.filter((row) => row.present).length;
      const attendancePct = student.attendance.length
        ? Math.round((present / student.attendance.length) * 100)
        : null;

      return ok(res, {
        student: {
          id: student.id,
          studentCode: student.studentCode,
          name: student.name,
          batch: student.batch.name,
          centre: student.centre.name,
        },
        outstanding: summary.outstanding,
        nextDue: nextDue
          ? {
              id: nextDue.id,
              sequence: nextDue.sequence,
              dueDate: nextDue.dueDate,
              remaining: nextDue.remaining,
              status: nextDue.status,
              daysOverdue: nextDue.daysOverdue,
            }
          : null,
        instalments: mapped.map((row) => ({
          id: row.id,
          sequence: row.sequence,
          dueDate: row.dueDate,
          amount: row.amount,
          amountPaid: row.amountPaid,
          remaining: row.remaining,
          status: row.status,
          daysOverdue: row.daysOverdue,
          briefSnapshotNote: row.briefSnapshotNote,
        })),
        receipts: mapped.flatMap((row) =>
          row.receipts.map((receipt) => ({
            id: receipt.id,
            receiptNo: receipt.receiptNo,
            totalAmount: toNumber(receipt.totalAmount),
            cgst: toNumber(receipt.cgst),
            sgst: toNumber(receipt.sgst),
            issuedAt: receipt.issuedAt,
            instalmentSequence: row.sequence,
          })),
        ),
        reminders: mapped.flatMap((row) =>
          row.reminders.map((reminder) => ({
            id: reminder.id,
            stage: reminder.stage,
            scheduledFor: reminder.scheduledFor,
            deliveryStatus: reminder.deliveryStatus,
            language: reminder.language,
            messagePreview: reminder.messagePreview,
            outstandingAmount: toNumber(reminder.outstandingAmount),
          })),
        ),
        attendanceSummary: { records: student.attendance.length, presentPct: attendancePct },
        testScores: student.testScores.map((score) => ({
          testName: score.test.name,
          heldOn: score.test.heldOn,
          score: score.score,
          maxScore: score.test.maxScore,
          pct: Math.round((score.score / score.test.maxScore) * 100),
        })),
        consent: student.consents[0] ?? null,
      });
    } catch (e) {
      return next(e);
    }
  },
);
