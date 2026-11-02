import { createHash, createHmac, timingSafeEqual } from "crypto";
import { addHours } from "date-fns";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { canAllocate, deriveInstalmentStatus, instalmentRemaining } from "./feeCalculation.js";
import { money, toFixed, toNumber } from "../utils/money.js";
import { cancelRemindersForInstalment } from "./reminderService.js";

function gstSplit(total: number | string | { toString(): string }) {
  const rate = env.GST_RATE;
  const totalD = money(total.toString());
  const taxable = totalD.div(1 + rate);
  const tax = totalD.minus(taxable);
  const half = tax.div(2);
  return {
    taxableAmount: toFixed(taxable),
    cgst: toFixed(half),
    sgst: toFixed(tax.minus(half)),
    totalAmount: toFixed(totalD),
  };
}

export async function createPaymentLink(instalmentId: string, expiresHours = 48) {
  const instalment = await prisma.instalment.findUniqueOrThrow({
    where: { id: instalmentId },
    include: { feePlan: { include: { student: true } } },
  });
  const remaining = instalmentRemaining(instalment);
  if (money(remaining).lessThanOrEqualTo(0)) {
    throw new Error("Instalment is already fully paid");
  }
  return prisma.paymentLink.create({
    data: {
      instalmentId,
      amount: remaining,
      expiresAt: addHours(new Date(), expiresHours),
    },
  });
}

export async function startMockCheckout(input: {
  paymentLinkToken: string;
  amount?: number;
  idempotencyKey?: string;
}) {
  const link = await prisma.paymentLink.findUnique({
    where: { token: input.paymentLinkToken },
    include: { instalment: true },
  });
  if (!link) throw new Error("Payment link not found");
  if (link.expiresAt < new Date()) throw new Error("Payment link expired");

  const remaining = instalmentRemaining(link.instalment);
  const amount = input.amount != null ? toFixed(input.amount) : remaining;
  const check = canAllocate(remaining, amount);
  if (!check.allowed) throw new Error(check.reason);

  if (input.idempotencyKey) {
    const existing = await prisma.idempotencyRecord.findUnique({
      where: { key: input.idempotencyKey },
    });
    if (existing) return existing.responseBody;
  }

  const payment = await prisma.payment.create({
    data: {
      amount,
      status: "PENDING",
      gatewayRef: `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      idempotencyKey: input.idempotencyKey ?? null,
      method: "mock_upi",
      metadata: { paymentLinkToken: link.token, instalmentId: link.instalmentId },
    },
  });

  await prisma.paymentLink.update({
    where: { id: link.id },
    data: { paymentId: payment.id },
  });

  const body = {
    paymentId: payment.id,
    gatewayRef: payment.gatewayRef,
    amount: toNumber(payment.amount),
    status: payment.status,
    checkoutUrl: `${env.APP_BASE_URL}/pay/${link.token}?session=${payment.id}`,
  };

  if (input.idempotencyKey) {
    await prisma.idempotencyRecord.create({
      data: {
        key: input.idempotencyKey,
        requestHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
        responseBody: body,
        statusCode: 200,
        expiresAt: addHours(new Date(), 24),
      },
    });
  }

  return body;
}

export function signWebhookPayload(payload: object): string {
  return createHmac("sha256", env.PAYMENT_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function verifyWebhookSignature(payload: object, signature: string): boolean {
  const expected = signWebhookPayload(payload);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export type WebhookPayload = {
  gatewayRef: string;
  status: "SUCCESS" | "FAILED" | "CANCELLED" | "TIMEOUT" | "UNMATCHED";
  amount: number;
  instalmentId?: string;
  duplicateOf?: string;
};

/**
 * Idempotent payment webhook processor.
 * SUCCESS allocates exactly once; UNMATCHED goes to review queue without cancelling reminders.
 */
export async function processPaymentWebhook(payload: WebhookPayload, signature: string) {
  if (!verifyWebhookSignature(payload, signature)) {
    throw new Error("Invalid webhook signature");
  }

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { gatewayRef: payload.gatewayRef },
    });
    if (!payment) {
      // Ambiguous: create unmatched shell
      const unmatchedPayment = await tx.payment.create({
        data: {
          amount: toFixed(payload.amount),
          status: "UNMATCHED",
          gatewayRef: payload.gatewayRef,
          reconciliationStatus: "UNMATCHED",
          metadata: payload as object,
        },
      });
      await tx.unmatchedPayment.create({
        data: {
          paymentId: unmatchedPayment.id,
          gatewayRef: payload.gatewayRef,
          amount: toFixed(payload.amount),
          reason: "No matching payment session for gateway reference",
        },
      });
      return { outcome: "unmatched_created", paymentId: unmatchedPayment.id };
    }

    // Idempotent: already terminal success with allocations
    if (payment.status === "SUCCESS") {
      return { outcome: "already_processed", paymentId: payment.id };
    }

    if (payload.status === "FAILED" || payload.status === "CANCELLED" || payload.status === "TIMEOUT") {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: payload.status,
          failureReason: payload.status,
          reconciliationStatus: "FAILED",
        },
      });
      return { outcome: "marked_failed", paymentId: payment.id, status: payload.status };
    }

    if (payload.status === "UNMATCHED") {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "UNMATCHED", reconciliationStatus: "UNMATCHED" },
      });
      await tx.unmatchedPayment.upsert({
        where: { paymentId: payment.id },
        create: {
          paymentId: payment.id,
          gatewayRef: payload.gatewayRef,
          amount: payment.amount,
          reason: "Gateway marked payment unmatched / ambiguous",
        },
        update: { reason: "Gateway marked payment unmatched / ambiguous", resolved: false },
      });
      return { outcome: "unmatched_queued", paymentId: payment.id };
    }

    // SUCCESS path
    const meta = (payment.metadata ?? {}) as { instalmentId?: string };
    const instalmentId = payload.instalmentId ?? meta.instalmentId;
    if (!instalmentId) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "UNMATCHED", reconciliationStatus: "UNMATCHED" },
      });
      await tx.unmatchedPayment.create({
        data: {
          paymentId: payment.id,
          gatewayRef: payload.gatewayRef,
          amount: payment.amount,
          reason: "Success webhook missing instalment mapping",
        },
      });
      return { outcome: "unmatched_no_instalment", paymentId: payment.id };
    }

    const instalment = await tx.instalment.findUniqueOrThrow({
      where: { id: instalmentId },
      include: { feePlan: { include: { student: true } } },
    });

    const remaining = instalmentRemaining(instalment);
    const payAmount = money(payment.amount);
    if (payAmount.greaterThan(money(remaining))) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "UNMATCHED", reconciliationStatus: "UNMATCHED" },
      });
      await tx.unmatchedPayment.create({
        data: {
          paymentId: payment.id,
          gatewayRef: payload.gatewayRef,
          amount: payment.amount,
          reason: "Payment amount exceeds instalment outstanding",
        },
      });
      return { outcome: "unmatched_overpay", paymentId: payment.id };
    }

    const existingAlloc = await tx.paymentAllocation.findUnique({
      where: {
        paymentId_instalmentId: { paymentId: payment.id, instalmentId },
      },
    });
    if (existingAlloc) {
      return { outcome: "already_allocated", paymentId: payment.id };
    }

    await tx.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        instalmentId,
        amount: payment.amount,
      },
    });

    const newPaid = money(instalment.amountPaid).plus(payAmount);
    const updatedInst = {
      amount: instalment.amount,
      amountPaid: newPaid,
      dueDate: instalment.dueDate,
    };
    const status = deriveInstalmentStatus(updatedInst);

    await tx.instalment.update({
      where: { id: instalmentId },
      data: { amountPaid: toFixed(newPaid), status },
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCESS",
        paidAt: new Date(),
        reconciliationStatus: "MATCHED",
      },
    });

    await tx.paymentLink.updateMany({
      where: { paymentId: payment.id },
      data: { usedAt: new Date() },
    });

    const gst = gstSplit(payment.amount);
    const receiptCount = await tx.receipt.count();
    const receipt = await tx.receipt.create({
      data: {
        receiptNo: `RCPT-${String(receiptCount + 1).padStart(5, "0")}`,
        paymentId: payment.id,
        instalmentId,
        studentCode: instalment.feePlan.student.studentCode,
        studentName: instalment.feePlan.student.name,
        taxableAmount: gst.taxableAmount,
        cgst: gst.cgst,
        sgst: gst.sgst,
        totalAmount: gst.totalAmount,
      },
    });

    // Cancel pending reminders only on successful allocation
    await cancelRemindersForInstalment(instalmentId, "payment_success", tx);

    return {
      outcome: "paid",
      paymentId: payment.id,
      receiptId: receipt.id,
      receiptNo: receipt.receiptNo,
      instalmentStatus: status,
    };
  });
}
