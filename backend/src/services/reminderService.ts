import type { Language, Prisma } from "@prisma/client";
import { addDays, subDays } from "date-fns";
import { prisma } from "../config/prisma.js";
import { atHourIst } from "../utils/dates.js";
import { instalmentRemaining } from "./feeCalculation.js";
import { money, toFixed } from "../utils/money.js";

type Tx = Prisma.TransactionClient | typeof prisma;

const TEMPLATES: Record<
  string,
  { EN: string; HI: string }
> = {
  BEFORE_DUE: {
    EN: "Reminder: ₹{amount} for {student} is due on {dueDate}. Pay before the due date to avoid overdue follow-up.",
    HI: "अनुस्मारक: {student} की किस्त ₹{amount} दिनांक {dueDate} को देय है। समय पर भुगतान करें।",
  },
  ON_DUE: {
    EN: "Payment due today: ₹{amount} for {student}. Use your FeeFlow pay link to settle now.",
    HI: "आज देय: {student} के लिए ₹{amount}। अभी FeeFlow भुगतान लिंक से भुगतान करें।",
  },
  AFTER_DUE: {
    EN: "Overdue: ₹{amount} remaining for {student} (due {dueDate}). Please pay the outstanding balance.",
    HI: "अतिदेय: {student} के लिए बकाया ₹{amount} (देय तिथि {dueDate})। शेष राशि का भुगतान करें।",
  },
};

function render(
  stage: "BEFORE_DUE" | "ON_DUE" | "AFTER_DUE",
  language: Language,
  vars: { amount: string; student: string; dueDate: string },
) {
  return TEMPLATES[stage][language]
    .replace("{amount}", vars.amount)
    .replace("{student}", vars.student)
    .replace("{dueDate}", vars.dueDate);
}

export async function ensureTemplates() {
  const stages = ["BEFORE_DUE", "ON_DUE", "AFTER_DUE"] as const;
  const languages = ["EN", "HI"] as const;
  for (const stage of stages) {
    for (const language of languages) {
      await prisma.reminderTemplate.upsert({
        where: {
          stage_language_channel: { stage, language, channel: "mock_sms" },
        },
        create: {
          stage,
          language,
          channel: "mock_sms",
          subject: `FeeFlow ${stage}`,
          body: TEMPLATES[stage][language],
        },
        update: { body: TEMPLATES[stage][language], isActive: true },
      });
    }
  }
}

export async function scheduleRemindersForInstalment(instalmentId: string) {
  const config =
    (await prisma.reminderConfig.findFirst()) ??
    (await prisma.reminderConfig.create({ data: {} }));

  const instalment = await prisma.instalment.findUniqueOrThrow({
    where: { id: instalmentId },
    include: {
      feePlan: {
        include: {
          student: {
            include: {
              parents: { include: { parent: true } },
              consents: true,
            },
          },
        },
      },
    },
  });

  const remaining = money(instalmentRemaining(instalment));
  if (!remaining.greaterThan(0)) return [];

  const parent = instalment.feePlan.student.parents[0]?.parent;
  const language: Language = parent?.language ?? "HI";
  const consent = instalment.feePlan.student.consents.find((c) => c.status === "GIVEN");
  if (!consent) {
    // Respect consent — skip scheduling
    return [];
  }

  const due = instalment.dueDate;
  const slots: { stage: "BEFORE_DUE" | "ON_DUE" | "AFTER_DUE"; when: Date }[] = [];

  for (const d of config.beforeDueDays) {
    slots.push({ stage: "BEFORE_DUE", when: atHourIst(subDays(due, d), config.sendHourIst) });
  }
  if (config.onDueEnabled) {
    slots.push({ stage: "ON_DUE", when: atHourIst(due, config.sendHourIst) });
  }
  for (const d of config.afterDueDays) {
    slots.push({ stage: "AFTER_DUE", when: atHourIst(addDays(due, d), config.sendHourIst) });
  }

  const created = [];
  for (const slot of slots) {
    if (slot.when < new Date()) continue; // don't create past duplicates for new schedules
    const template = await prisma.reminderTemplate.findUniqueOrThrow({
      where: {
        stage_language_channel: {
          stage: slot.stage,
          language,
          channel: "mock_sms",
        },
      },
    });
    const preview = render(slot.stage, language, {
      amount: toFixed(remaining),
      student: instalment.feePlan.student.name,
      dueDate: due.toISOString().slice(0, 10),
    });
    try {
      const rem = await prisma.reminder.create({
        data: {
          instalmentId,
          templateId: template.id,
          stage: slot.stage,
          language,
          channel: "mock_sms",
          scheduledFor: slot.when,
          outstandingAmount: toFixed(remaining),
          messagePreview: preview,
          deliveryStatus: "SCHEDULED",
        },
      });
      created.push(rem);
    } catch {
      // unique constraint — duplicate prevented
    }
  }
  return created;
}

export async function cancelRemindersForInstalment(
  instalmentId: string,
  reason: string,
  tx: Tx = prisma,
) {
  await tx.reminder.updateMany({
    where: {
      instalmentId,
      deliveryStatus: { in: ["SCHEDULED"] },
    },
    data: {
      deliveryStatus: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason,
    },
  });
}

export async function dispatchDueReminders(now = new Date()) {
  const due = await prisma.reminder.findMany({
    where: {
      deliveryStatus: "SCHEDULED",
      scheduledFor: { lte: now },
    },
    include: { instalment: true },
  });

  const results = [];
  for (const rem of due) {
    const remaining = money(instalmentRemaining(rem.instalment));
    if (!remaining.greaterThan(0)) {
      await prisma.reminder.update({
        where: { id: rem.id },
        data: {
          deliveryStatus: "CANCELLED",
          cancelledAt: now,
          cancelReason: "already_paid_before_send",
        },
      });
      results.push({ id: rem.id, status: "CANCELLED" });
      continue;
    }
    // Mock delivery — never claims a real SMS was sent
    await prisma.reminder.update({
      where: { id: rem.id },
      data: {
        deliveryStatus: "SENT",
        sentAt: now,
        outstandingAmount: toFixed(remaining),
        messagePreview: rem.messagePreview.replace(/₹[\d.]+/, `₹${toFixed(remaining)}`),
      },
    });
    results.push({ id: rem.id, status: "SENT", mock: true });
  }
  return results;
}

export async function recalculatePartialReminderAmounts(instalmentId: string) {
  const instalment = await prisma.instalment.findUniqueOrThrow({
    where: { id: instalmentId },
    include: { feePlan: { include: { student: true } } },
  });
  const remaining = toFixed(instalmentRemaining(instalment));
  const pending = await prisma.reminder.findMany({
    where: { instalmentId, deliveryStatus: "SCHEDULED" },
  });
  for (const rem of pending) {
    const preview = rem.messagePreview.replace(/₹[\d.]+/, `₹${remaining}`);
    await prisma.reminder.update({
      where: { id: rem.id },
      data: { outstandingAmount: remaining, messagePreview: preview },
    });
  }
}
