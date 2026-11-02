import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { ok } from "../../utils/response.js";
import {
  dispatchDueReminders,
  scheduleRemindersForInstalment,
} from "../../services/reminderService.js";
import { toNumber } from "../../utils/money.js";

export const remindersRouter = Router();
remindersRouter.use(requireAuth, requireRole("ACCOUNTS"));

remindersRouter.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await prisma.reminder.findMany({
      where: status ? { deliveryStatus: status as never } : undefined,
      include: {
        instalment: {
          include: { feePlan: { include: { student: { include: { centre: true, batch: true } } } } },
        },
        template: true,
      },
      orderBy: { scheduledFor: "desc" },
      take: 200,
    });
    return ok(
      res,
      rows.map((r) => ({
        id: r.id,
        student: r.instalment.feePlan.student.name,
        studentCode: r.instalment.feePlan.student.studentCode,
        instalmentSequence: r.instalment.sequence,
        dueDate: r.instalment.dueDate,
        outstandingAmount: toNumber(r.outstandingAmount),
        stage: r.stage,
        language: r.language,
        channel: r.channel,
        scheduledFor: r.scheduledFor,
        deliveryStatus: r.deliveryStatus,
        messagePreview: r.messagePreview,
        cancelReason: r.cancelReason,
      })),
    );
  } catch (e) {
    return next(e);
  }
});

remindersRouter.get("/history", async (_req, res, next) => {
  try {
    const rows = await prisma.reminder.findMany({
      where: { deliveryStatus: { in: ["SENT", "CANCELLED", "FAILED"] } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        instalment: { include: { feePlan: { include: { student: true } } } },
      },
    });
    return ok(
      res,
      rows.map((r) => ({
        id: r.id,
        student: r.instalment.feePlan.student.name,
        stage: r.stage,
        deliveryStatus: r.deliveryStatus,
        scheduledFor: r.scheduledFor,
        sentAt: r.sentAt,
        cancelledAt: r.cancelledAt,
        cancelReason: r.cancelReason,
        messagePreview: r.messagePreview,
        outstandingAmount: toNumber(r.outstandingAmount),
      })),
    );
  } catch (e) {
    return next(e);
  }
});

remindersRouter.post("/preview", async (req, res, next) => {
  try {
    const { instalmentId } = z.object({ instalmentId: z.string() }).parse(req.body);
    const created = await scheduleRemindersForInstalment(instalmentId);
    return ok(res, { scheduled: created.length, reminders: created });
  } catch (e) {
    return next(e);
  }
});

remindersRouter.post("/dispatch", async (_req, res, next) => {
  try {
    const results = await dispatchDueReminders();
    return ok(res, { dispatched: results, note: "Mock delivery only — no real SMS/WhatsApp sent" });
  } catch (e) {
    return next(e);
  }
});
