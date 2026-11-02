import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { ok } from "../../utils/response.js";
import {
  deriveInstalmentStatus,
  instalmentDaysOverdue,
  instalmentRemaining,
} from "../../services/feeCalculation.js";
import { money, toNumber } from "../../utils/money.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireRole("ACCOUNTS"));

dashboardRouter.get("/summary", async (req, res, next) => {
  try {
    const centreId = typeof req.query.centreId === "string" ? req.query.centreId : undefined;
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;

    const instalments = await prisma.instalment.findMany({
      where: {
        feePlan: {
          isActive: true,
          student: {
            deletedAt: null,
            centreId,
            batchId,
          },
        },
      },
      include: {
        feePlan: { include: { student: { include: { centre: true, batch: true } } } },
        allocations: { include: { payment: true } },
      },
    });

    let billed = money(0);
    let collected = money(0);
    let overdueAmt = money(0);
    let overdueStudents = new Set<string>();

    for (const inst of instalments) {
      billed = billed.plus(money(inst.amount));
      collected = collected.plus(money(inst.amountPaid));
      const status = deriveInstalmentStatus(inst);
      const rem = money(instalmentRemaining(inst));
      if ((status === "OVERDUE" || instalmentDaysOverdue(inst) > 0) && rem.greaterThan(0)) {
        overdueAmt = overdueAmt.plus(rem);
        overdueStudents.add(inst.feePlan.studentId);
      }
    }

    const outstanding = billed.minus(collected);
    const collectionPct = billed.isZero()
      ? 0
      : Number(collected.div(billed).mul(100).toFixed(1));

    const recentPayments = await prisma.payment.findMany({
      where: { status: "SUCCESS" },
      orderBy: { paidAt: "desc" },
      take: 8,
    });

    const atRisk = await prisma.riskAssessment.count({
      where: {
        category: { in: ["HIGH", "MEDIUM"] },
        assessedAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
    });

    // Simple collection trend: last 6 months of successful payments
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    const successPayments = await prisma.payment.findMany({
      where: { status: "SUCCESS", paidAt: { gte: sixMonthsAgo } },
      select: { amount: true, paidAt: true },
    });
    const trendMap = new Map<string, number>();
    for (const p of successPayments) {
      const key = (p.paidAt ?? new Date()).toISOString().slice(0, 7);
      trendMap.set(key, (trendMap.get(key) ?? 0) + toNumber(p.amount));
    }
    const collectionTrend = [...trendMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));

    return ok(res, {
      totalBilled: toNumber(billed),
      totalCollected: toNumber(collected),
      outstanding: toNumber(outstanding.lessThan(0) ? 0 : outstanding),
      overdueAmount: toNumber(overdueAmt),
      collectionPct,
      overdueStudentCount: overdueStudents.size,
      atRiskCount: atRisk,
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        amount: toNumber(p.amount),
        paidAt: p.paidAt,
        gatewayRef: p.gatewayRef,
      })),
      collectionTrend,
    });
  } catch (e) {
    return next(e);
  }
});

dashboardRouter.get("/ageing", async (req, res, next) => {
  try {
    const centreId = typeof req.query.centreId === "string" ? req.query.centreId : undefined;
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;
    const instalments = await prisma.instalment.findMany({
      where: {
        feePlan: { isActive: true, student: { deletedAt: null, centreId, batchId } },
      },
    });
    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    for (const inst of instalments) {
      const rem = toNumber(instalmentRemaining(inst));
      const days = instalmentDaysOverdue(inst);
      if (rem <= 0 || days <= 0) continue;
      if (days <= 30) buckets["0-30"] += rem;
      else if (days <= 60) buckets["31-60"] += rem;
      else if (days <= 90) buckets["61-90"] += rem;
      else buckets["90+"] += rem;
    }
    return ok(res, buckets);
  } catch (e) {
    return next(e);
  }
});

dashboardRouter.get("/centre-wise", async (_req, res, next) => {
  try {
    const centres = await prisma.centre.findMany({ include: { students: { include: { feePlans: { where: { isActive: true }, include: { instalments: true } } } } } });
    const rows = centres.map((c) => {
      let billed = 0;
      let collected = 0;
      let overdue = 0;
      for (const s of c.students) {
        for (const p of s.feePlans) {
          for (const i of p.instalments) {
            billed += toNumber(i.amount);
            collected += toNumber(i.amountPaid);
            const rem = toNumber(instalmentRemaining(i));
            if (instalmentDaysOverdue(i) > 0 && rem > 0) overdue += rem;
          }
        }
      }
      return {
        centreId: c.id,
        code: c.code,
        name: c.name,
        billed,
        collected,
        outstanding: Math.max(0, billed - collected),
        overdue,
      };
    });
    return ok(res, rows);
  } catch (e) {
    return next(e);
  }
});

dashboardRouter.get("/batch-wise", async (req, res, next) => {
  try {
    const centreId = typeof req.query.centreId === "string" ? req.query.centreId : undefined;
    const batches = await prisma.batch.findMany({
      where: { centreId },
      include: {
        students: {
          include: { feePlans: { where: { isActive: true }, include: { instalments: true } } },
        },
        centre: true,
      },
    });
    const rows = batches.map((b) => {
      let billed = 0;
      let collected = 0;
      let overdue = 0;
      for (const s of b.students) {
        for (const p of s.feePlans) {
          for (const i of p.instalments) {
            billed += toNumber(i.amount);
            collected += toNumber(i.amountPaid);
            const rem = toNumber(instalmentRemaining(i));
            if (instalmentDaysOverdue(i) > 0 && rem > 0) overdue += rem;
          }
        }
      }
      return {
        batchId: b.id,
        code: b.code,
        name: b.name,
        centre: b.centre.name,
        billed,
        collected,
        outstanding: Math.max(0, billed - collected),
        overdue,
      };
    });
    return ok(res, rows);
  } catch (e) {
    return next(e);
  }
});
