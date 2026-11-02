import { Router } from "express";
import { param } from "../../utils/params.js";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { ok, fail } from "../../utils/response.js";
import { scoreDropoutRisk } from "../../services/riskScoring.js";
import { instalmentDaysOverdue, instalmentRemaining } from "../../services/feeCalculation.js";
import { money } from "../../utils/money.js";

export const riskRouter = Router();
riskRouter.use(requireAuth, requireRole("ACCOUNTS"));

export async function assessStudentRisk(studentId: string) {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: {
      feePlans: { where: { isActive: true }, include: { instalments: true } },
      attendance: { orderBy: { date: "asc" } },
      testScores: { include: { test: true }, orderBy: { test: { heldOn: "asc" } } },
    },
  });

  const instalments = student.feePlans[0]?.instalments ?? [];
  const missedInstalments = instalments.filter(
    (i) => instalmentDaysOverdue(i) > 0 && money(instalmentRemaining(i)).greaterThan(0),
  ).length;

  const mid = Math.floor(student.attendance.length / 2);
  let attendancePriorPct: number | null = null;
  let attendanceRecentPct: number | null = null;
  if (student.attendance.length >= 4) {
    const prior = student.attendance.slice(0, mid);
    const recent = student.attendance.slice(mid);
    attendancePriorPct = Math.round((prior.filter((a) => a.present).length / prior.length) * 100);
    attendanceRecentPct = Math.round((recent.filter((a) => a.present).length / recent.length) * 100);
  }

  let testPriorAvgPct: number | null = null;
  let testRecentAvgPct: number | null = null;
  if (student.testScores.length >= 2) {
    const scores = student.testScores.map((t) => (t.score / t.test.maxScore) * 100);
    const tMid = Math.floor(scores.length / 2);
    const prior = scores.slice(0, tMid);
    const recent = scores.slice(tMid);
    testPriorAvgPct = Math.round(prior.reduce((a, b) => a + b, 0) / prior.length);
    testRecentAvgPct = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  }

  const result = scoreDropoutRisk({
    missedInstalments,
    attendanceRecentPct,
    attendancePriorPct,
    testRecentAvgPct,
    testPriorAvgPct,
  });

  const assessment = await prisma.riskAssessment.create({
    data: {
      studentId,
      category: result.category,
      score: result.score,
      factors: result.factors,
      explanation: result.explanation,
      inputs: result.inputs,
    },
  });

  let task = null;
  if (result.category === "HIGH" || result.category === "MEDIUM") {
    task = await prisma.counsellorTask.create({
      data: {
        studentId,
        riskAssessmentId: assessment.id,
        title: `Counsellor call — ${result.category} dropout risk`,
        notes:
          "Safety rule: risk flag creates a counsellor call task only. No fee action and no parent message.",
        status: "OPEN",
      },
    });
  }

  return { assessment, task, result };
}

riskRouter.get("/assessments", async (_req, res, next) => {
  try {
    const rows = await prisma.riskAssessment.findMany({
      include: {
        student: { include: { centre: true, batch: true } },
        counsellorTasks: true,
      },
      orderBy: { assessedAt: "desc" },
      take: 100,
    });
    return ok(res, rows);
  } catch (e) {
    return next(e);
  }
});

riskRouter.post("/assessments/run/:studentId", async (req, res, next) => {
  try {
    const out = await assessStudentRisk(param(req, "studentId"));
    return ok(res, out, 201);
  } catch (e) {
    return next(e);
  }
});

riskRouter.post("/assessments/:id/false-positive", async (req, res, next) => {
  try {
    const { note } = z.object({ note: z.string().min(3) }).parse(req.body);
    const assessment = await prisma.riskAssessment.findUnique({
      where: { id: param(req, "id") },
      include: { counsellorTasks: true },
    });
    if (!assessment) return fail(res, "Assessment not found", 404);

    const tasks = await prisma.counsellorTask.updateMany({
      where: { riskAssessmentId: assessment.id },
      data: {
        status: "FALSE_POSITIVE",
        falsePositiveNote: note,
        closedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "risk.false_positive",
        entityType: "RiskAssessment",
        entityId: assessment.id,
        metadata: { note },
      },
    });

    return ok(res, {
      updatedTasks: tasks.count,
      message: "False-positive feedback stored for future model improvement. No fee changes applied.",
    });
  } catch (e) {
    return next(e);
  }
});

riskRouter.get("/tasks", async (_req, res, next) => {
  try {
    const tasks = await prisma.counsellorTask.findMany({
      include: {
        student: { include: { centre: true, batch: true } },
        riskAssessment: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, tasks);
  } catch (e) {
    return next(e);
  }
});
