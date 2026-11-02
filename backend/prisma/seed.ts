/**
 * Deterministic FeeFlow seed.
 * Preserves brief sample snapshot notes for STU-0412 / STU-0587 / STU-0219.
 * Live overdue status is recalculated from system date separately in APIs.
 */
import bcrypt from "bcryptjs";
import { PrismaClient, Language } from "@prisma/client";
import { ensureTemplates } from "../src/services/reminderService.js";
import { scheduleRemindersForInstalment } from "../src/services/reminderService.js";
import { assessStudentRisk } from "../src/modules/risk/risk.routes.js";
import { signWebhookPayload, processPaymentWebhook } from "../src/services/paymentService.js";

const prisma = new PrismaClient();

async function main() {
  console.info("Seeding FeeFlow…");

  // Clean in dependency order
  const tables = [
    "IdempotencyRecord",
    "UnmatchedPayment",
    "AuditLog",
    "CounsellorTask",
    "RiskAssessment",
    "ParentalConsent",
    "TestScore",
    "Test",
    "AttendanceRecord",
    "RefundRequest",
    "Reminder",
    "ReminderTemplate",
    "ReminderConfig",
    "Receipt",
    "PaymentAllocation",
    "PaymentLink",
    "Payment",
    "Discount",
    "Instalment",
    "FeePlan",
    "ParentStudent",
    "Student",
    "Batch",
    "Centre",
    "Parent",
    "OtpCode",
    "User",
    "RefundPolicy",
  ];
  for (const t of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" CASCADE;`).catch(() => undefined);
  }

  const accountsHash = await bcrypt.hash("Accounts@123", 10);
  const accounts = await prisma.user.create({
    data: {
      email: "accounts@feeflow.demo",
      passwordHash: accountsHash,
      role: "ACCOUNTS",
      name: "Priya Sharma (Accounts)",
    },
  });

  const centres = await Promise.all(
    [
      { code: "JPR-MN", name: "Malviya Nagar Centre", city: "Jaipur" },
      { code: "JPR-VK", name: "Vaishali Nagar Centre", city: "Jaipur" },
      { code: "JPR-TG", name: "Tonk Road Centre", city: "Jaipur" },
      { code: "JPR-RP", name: "Raja Park Centre", city: "Jaipur" },
    ].map((c) => prisma.centre.create({ data: c })),
  );

  const batches = await Promise.all([
    prisma.batch.create({
      data: {
        code: "JEE-27-M",
        name: "JEE 2027 Morning",
        centreId: centres[0].id,
        stream: "JEE",
        year: 2027,
        shift: "Morning",
      },
    }),
    prisma.batch.create({
      data: {
        code: "JEE-27-E",
        name: "JEE 2027 Evening",
        centreId: centres[1].id,
        stream: "JEE",
        year: 2027,
        shift: "Evening",
      },
    }),
    prisma.batch.create({
      data: {
        code: "NEET-27-M",
        name: "NEET 2027 Morning",
        centreId: centres[2].id,
        stream: "NEET",
        year: 2027,
        shift: "Morning",
      },
    }),
    prisma.batch.create({
      data: {
        code: "NEET-27-E",
        name: "NEET 2027 Evening",
        centreId: centres[3].id,
        stream: "NEET",
        year: 2027,
        shift: "Evening",
      },
    }),
  ]);

  await prisma.refundPolicy.create({
    data: {
      version: "illustrative-v1",
      name: "Illustrative Pro-Rata Policy (MVP)",
      formulaDescription:
        "ASSUMPTION: eligibleNetFee × remainingDays / totalDays, capped at paid − alreadyRefunded. NOT client-approved written policy.",
      processingDays: 10,
      nonRefundableAmount: 0,
      isIllustrative: true,
      isActive: true,
    },
  });

  await prisma.reminderConfig.create({
    data: {
      beforeDueDays: [3],
      onDueEnabled: true,
      afterDueDays: [3, 7, 15],
      sendHourIst: 9,
      timezone: "Asia/Kolkata",
    },
  });
  await ensureTemplates();

  // Parents
  async function createParent(name: string, phone: string, language: Language) {
    const user = await prisma.user.create({
      data: { phone, role: "PARENT", name },
    });
    return prisma.parent.create({
      data: { userId: user.id, phone, language },
    });
  }

  const parentAarav = await createParent("Ramesh Meena", "9876500412", "HI");
  const parentIshita = await createParent("Sunita Sharma", "9876500587", "EN");
  const parentMohit = await createParent("Suresh Gurjar", "9876500219", "HI");
  const parentExtra = await createParent("Neha Verma", "9876500999", "EN");

  const courseStart = new Date("2026-04-01T00:00:00+05:30");
  const courseEnd = new Date("2027-03-31T00:00:00+05:30");

  type InstSeed = {
    sequence: number;
    dueDate: string;
    amount: number;
    amountPaid: number;
    briefSnapshotNote?: string;
  };

  async function createStudent(opts: {
    code: string;
    name: string;
    centreId: string;
    batchId: string;
    parentId: string;
    baseFee: number;
    discount?: number;
    instalments: InstSeed[];
  }) {
    const student = await prisma.student.create({
      data: {
        studentCode: opts.code,
        name: opts.name,
        centreId: opts.centreId,
        batchId: opts.batchId,
        courseStartDate: courseStart,
        courseEndDate: courseEnd,
        isMinor: true,
      },
    });
    await prisma.parentStudent.create({
      data: { parentId: opts.parentId, studentId: student.id, relation: "father/mother" },
    });
    await prisma.parentalConsent.create({
      data: {
        parentId: opts.parentId,
        studentId: student.id,
        version: "dpdp-demo-v1",
        status: "GIVEN",
        method: "seed_demo",
        consentedAt: new Date("2026-03-15T10:00:00+05:30"),
      },
    });
    const discount = opts.discount ?? 0;
    const net = opts.baseFee - discount;
    const plan = await prisma.feePlan.create({
      data: {
        studentId: student.id,
        name: "Annual 2026-27",
        baseFee: opts.baseFee,
        netFee: net,
        instalmentCount: opts.instalments.length,
        isActive: true,
        activatedAt: courseStart,
      },
    });
    if (discount > 0) {
      await prisma.discount.create({
        data: {
          feePlanId: plan.id,
          label: "Merit scholarship",
          amount: discount,
          approvedBy: accounts.id,
          approvedAt: courseStart,
        },
      });
    }
    const createdInst = [];
    for (const inst of opts.instalments) {
      const row = await prisma.instalment.create({
        data: {
          feePlanId: plan.id,
          sequence: inst.sequence,
          dueDate: new Date(`${inst.dueDate}T00:00:00+05:30`),
          amount: inst.amount,
          amountPaid: inst.amountPaid,
          status: "UPCOMING",
          briefSnapshotNote: inst.briefSnapshotNote,
        },
      });
      createdInst.push(row);
    }
    return { student, plan, instalments: createdInst };
  }

  // Exact brief samples
  const aarav = await createStudent({
    code: "STU-0412",
    name: "Aarav Meena",
    centreId: centres[0].id,
    batchId: batches[0].id,
    parentId: parentAarav.id,
    baseFee: 120000,
    instalments: [
      {
        sequence: 1,
        dueDate: "2026-10-10",
        amount: 30000,
        amountPaid: 30000,
        briefSnapshotNote: "Brief snapshot: Paid ₹30000 on due 2026-10-10",
      },
      { sequence: 2, dueDate: "2026-12-10", amount: 30000, amountPaid: 0 },
      { sequence: 3, dueDate: "2027-02-10", amount: 30000, amountPaid: 0 },
      { sequence: 4, dueDate: "2027-03-20", amount: 30000, amountPaid: 0 },
    ],
  });

  const ishita = await createStudent({
    code: "STU-0587",
    name: "Ishita Sharma",
    centreId: centres[1].id,
    batchId: batches[1].id,
    parentId: parentIshita.id,
    baseFee: 120000,
    discount: 0,
    instalments: [
      {
        sequence: 1,
        dueDate: "2026-10-10",
        amount: 30000,
        amountPaid: 15000,
        briefSnapshotNote:
          "Brief snapshot (as of ~2026-11-02): Part paid ₹15000 / ₹30000, 23 days overdue",
      },
      { sequence: 2, dueDate: "2026-12-10", amount: 30000, amountPaid: 0 },
      { sequence: 3, dueDate: "2027-02-10", amount: 30000, amountPaid: 0 },
      { sequence: 4, dueDate: "2027-03-20", amount: 30000, amountPaid: 0 },
    ],
  });

  const mohit = await createStudent({
    code: "STU-0219",
    name: "Mohit Gurjar",
    centreId: centres[2].id,
    batchId: batches[2].id,
    parentId: parentMohit.id,
    baseFee: 120000,
    instalments: [
      {
        sequence: 1,
        dueDate: "2026-11-15",
        amount: 40000,
        amountPaid: 0,
        briefSnapshotNote: "Brief snapshot (as of ~2026-11-02): Due in 13 days, ₹40000",
      },
      { sequence: 2, dueDate: "2027-01-15", amount: 40000, amountPaid: 0 },
      { sequence: 3, dueDate: "2027-03-15", amount: 40000, amountPaid: 0 },
    ],
  });

  // Extra synthetic students for dashboard realism
  const kabir = await createStudent({
    code: "STU-1001",
    name: "Kabir Singh",
    centreId: centres[0].id,
    batchId: batches[0].id,
    parentId: parentExtra.id,
    baseFee: 120000,
    discount: 10000,
    instalments: [
      { sequence: 1, dueDate: "2026-07-01", amount: 27500, amountPaid: 27500 },
      { sequence: 2, dueDate: "2026-09-01", amount: 27500, amountPaid: 0 },
      { sequence: 3, dueDate: "2026-11-01", amount: 27500, amountPaid: 0 },
      { sequence: 4, dueDate: "2027-01-01", amount: 27500, amountPaid: 0 },
    ],
  });

  const ananya = await createStudent({
    code: "STU-1002",
    name: "Ananya Gupta",
    centreId: centres[3].id,
    batchId: batches[3].id,
    parentId: parentExtra.id,
    baseFee: 120000,
    instalments: [
      { sequence: 1, dueDate: "2026-06-01", amount: 40000, amountPaid: 40000 },
      { sequence: 2, dueDate: "2026-09-01", amount: 40000, amountPaid: 40000 },
      { sequence: 3, dueDate: "2026-12-01", amount: 40000, amountPaid: 0 },
    ],
  });

  // Record historical payment for Aarav inst 1 + Ishita partial
  async function seedSuccessPayment(instalmentId: string, amount: number, ref: string) {
    const payment = await prisma.payment.create({
      data: {
        amount,
        status: "SUCCESS",
        gatewayRef: ref,
        method: "mock_upi",
        paidAt: new Date("2026-10-10T11:00:00+05:30"),
        reconciliationStatus: "MATCHED",
        metadata: { instalmentId },
      },
    });
    await prisma.paymentAllocation.create({
      data: { paymentId: payment.id, instalmentId, amount },
    });
    const inst = await prisma.instalment.findUniqueOrThrow({
      where: { id: instalmentId },
      include: { feePlan: { include: { student: true } } },
    });
    const taxable = amount / 1.18;
    const tax = amount - taxable;
    await prisma.receipt.create({
      data: {
        receiptNo: `RCPT-SEED-${ref.slice(-4)}`,
        paymentId: payment.id,
        instalmentId,
        studentCode: inst.feePlan.student.studentCode,
        studentName: inst.feePlan.student.name,
        taxableAmount: taxable.toFixed(2),
        cgst: (tax / 2).toFixed(2),
        sgst: (tax / 2).toFixed(2),
        totalAmount: amount.toFixed(2),
        issuedAt: new Date("2026-10-10T11:05:00+05:30"),
      },
    });
  }

  await seedSuccessPayment(aarav.instalments[0].id, 30000, "MOCK-SEED-AARAV");
  await seedSuccessPayment(ishita.instalments[0].id, 15000, "MOCK-SEED-ISHITA");
  await seedSuccessPayment(kabir.instalments[0].id, 27500, "MOCK-SEED-KABIR");
  await seedSuccessPayment(ananya.instalments[0].id, 40000, "MOCK-SEED-ANANYA1");
  await seedSuccessPayment(ananya.instalments[1].id, 40000, "MOCK-SEED-ANANYA2");

  // Unmatched payment in queue
  const unmatchedPay = await prisma.payment.create({
    data: {
      amount: 5000,
      status: "UNMATCHED",
      gatewayRef: "MOCK-UNMATCHED-001",
      reconciliationStatus: "UNMATCHED",
      metadata: { note: "Ambiguous UTR without student mapping" },
    },
  });
  await prisma.unmatchedPayment.create({
    data: {
      paymentId: unmatchedPay.id,
      gatewayRef: "MOCK-UNMATCHED-001",
      amount: 5000,
      reason: "No matching payment session for gateway reference",
    },
  });

  // Attendance + tests for risk scenarios
  async function seedAttendance(studentId: string, priorPct: number, recentPct: number) {
    const days = 40;
    for (let i = 0; i < days; i++) {
      const d = new Date("2026-09-01T00:00:00+05:30");
      d.setDate(d.getDate() + i);
      const pct = i < 20 ? priorPct : recentPct;
      const present = i % 100 < pct;
      await prisma.attendanceRecord.create({
        data: { studentId, date: d, present },
      });
    }
  }

  await seedAttendance(ishita.student.id, 90, 55);
  await seedAttendance(kabir.student.id, 85, 80);
  await seedAttendance(mohit.student.id, 70, 68);
  // Aarav: insufficient attendance variety intentionally sparse
  await prisma.attendanceRecord.create({
    data: { studentId: aarav.student.id, date: new Date("2026-10-01"), present: true },
  });

  const testEarly = await prisma.test.create({
    data: {
      batchId: batches[1].id,
      name: "JEE Mock 1",
      heldOn: new Date("2026-08-15"),
      maxScore: 100,
    },
  });
  const testLate = await prisma.test.create({
    data: {
      batchId: batches[1].id,
      name: "JEE Mock 2",
      heldOn: new Date("2026-10-20"),
      maxScore: 100,
    },
  });
  await prisma.testScore.create({
    data: { testId: testEarly.id, studentId: ishita.student.id, score: 72 },
  });
  await prisma.testScore.create({
    data: { testId: testLate.id, studentId: ishita.student.id, score: 48 },
  });

  // Schedule reminders for outstanding instalments
  for (const inst of [
    ...ishita.instalments,
    ...mohit.instalments,
    ...kabir.instalments.filter((i) => i.sequence > 1),
  ]) {
    await scheduleRemindersForInstalment(inst.id);
  }

  // Force some overdue reminders into SENT for demo history (Ishita)
  await prisma.reminder.updateMany({
    where: {
      instalmentId: ishita.instalments[0].id,
      stage: "AFTER_DUE",
    },
    data: {
      deliveryStatus: "SENT",
      sentAt: new Date("2026-10-20T09:00:00+05:30"),
      scheduledFor: new Date("2026-10-13T09:00:00+05:30"),
    },
  });

  // Risk assessments
  await assessStudentRisk(ishita.student.id); // high
  await assessStudentRisk(kabir.student.id); // medium/low
  await assessStudentRisk(aarav.student.id); // insufficient / low
  await assessStudentRisk(mohit.student.id);
  await assessStudentRisk(ananya.student.id);

  // Mark one false-positive example
  const fpTask = await prisma.counsellorTask.findFirst({
    where: { studentId: kabir.student.id },
  });
  if (fpTask) {
    await prisma.counsellorTask.update({
      where: { id: fpTask.id },
      data: {
        status: "FALSE_POSITIVE",
        falsePositiveNote: "Family travel explained absences; fees being arranged.",
        closedAt: new Date(),
      },
    });
  }

  // Duplicate webhook safety smoke via process (optional soft)
  void processPaymentWebhook;
  void signWebhookPayload;

  console.info("Seed complete.");
  console.info("Accounts: accounts@feeflow.demo / Accounts@123");
  console.info("Parent phones: 9876500412, 9876500587, 9876500219, 9876500999");
  console.info("OTP demo code: 246810 (when OTP_DEMO_MODE=true)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
