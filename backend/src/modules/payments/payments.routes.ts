import { Router } from "express";
import { param } from "../../utils/params.js";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { ok, fail } from "../../utils/response.js";
import {
  createPaymentLink,
  processPaymentWebhook,
  signWebhookPayload,
  startMockCheckout,
} from "../../services/paymentService.js";
import { toNumber } from "../../utils/money.js";
import { env } from "../../config/env.js";

export const paymentsRouter = Router();
export const instalmentsRouter = Router();

instalmentsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const inst = await prisma.instalment.findUnique({
      where: { id: param(req, "id") },
      include: {
        feePlan: { include: { student: { include: { parents: true } } } },
        paymentLinks: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    if (!inst) return fail(res, "Instalment not found", 404);
    if (req.user!.role === "PARENT") {
      const allowed = inst.feePlan.student.parents.some((p) => p.parentId === req.user!.parentId);
      if (!allowed) return fail(res, "Forbidden", 403);
    }
    return ok(res, { ...inst, amount: toNumber(inst.amount), amountPaid: toNumber(inst.amountPaid) });
  } catch (e) {
    return next(e);
  }
});

instalmentsRouter.post(
  "/:id/payment-link",
  requireAuth,
  async (req, res, next) => {
    try {
      const inst = await prisma.instalment.findUnique({
        where: { id: param(req, "id") },
        include: { feePlan: { include: { student: { include: { parents: true } } } } },
      });
      if (!inst) return fail(res, "Instalment not found", 404);
      if (req.user!.role === "PARENT") {
        const allowed = inst.feePlan.student.parents.some((p) => p.parentId === req.user!.parentId);
        if (!allowed) return fail(res, "Forbidden", 403);
      }
      const link = await createPaymentLink(param(req, "id"));
      return ok(
        res,
        {
          ...link,
          amount: toNumber(link.amount),
          url: `${env.APP_BASE_URL}/pay/${link.token}`,
        },
        201,
      );
    } catch (e) {
      return next(e);
    }
  },
);

// Public test-mode checkout via payment link token (no fee mutation without signed webhook)
paymentsRouter.post("/mock-checkout", async (req, res, next) => {
  try {
    const body = z
      .object({
        paymentLinkToken: z.string(),
        amount: z.number().positive().optional(),
        idempotencyKey: z.string().optional(),
      })
      .parse(req.body);
    const session = await startMockCheckout(body);
    return ok(res, session, 201);
  } catch (e) {
    return next(e);
  }
});

paymentsRouter.post("/mock-complete", async (req, res, next) => {
  try {
    const body = z
      .object({
        paymentId: z.string(),
        result: z.enum(["SUCCESS", "FAILED", "CANCELLED", "TIMEOUT", "UNMATCHED"]),
        amount: z.number().positive().optional(),
      })
      .parse(req.body);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: body.paymentId } });
    const meta = (payment.metadata ?? {}) as { instalmentId?: string };
    const payload = {
      gatewayRef: payment.gatewayRef!,
      status: body.result,
      amount: body.amount ?? toNumber(payment.amount),
      instalmentId: meta.instalmentId,
    };
    const signature = signWebhookPayload(payload);
    const result = await processPaymentWebhook(payload, signature);
    return ok(res, result);
  } catch (e) {
    return next(e);
  }
});

paymentsRouter.post("/webhook", async (req, res, next) => {
  try {
    const signature = String(req.headers["x-feeflow-signature"] ?? "");
    const payload = z
      .object({
        gatewayRef: z.string(),
        status: z.enum(["SUCCESS", "FAILED", "CANCELLED", "TIMEOUT", "UNMATCHED"]),
        amount: z.number(),
        instalmentId: z.string().optional(),
      })
      .parse(req.body);
    const result = await processPaymentWebhook(payload, signature);
    return ok(res, result);
  } catch (e) {
    return next(e);
  }
});

paymentsRouter.get("/unmatched", requireAuth, requireRole("ACCOUNTS"), async (_req, res, next) => {
  try {
    const rows = await prisma.unmatchedPayment.findMany({
      where: { resolved: false },
      include: { payment: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(
      res,
      rows.map((r) => ({
        ...r,
        amount: toNumber(r.amount),
        payment: { ...r.payment, amount: toNumber(r.payment.amount) },
      })),
    );
  } catch (e) {
    return next(e);
  }
});

paymentsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: param(req, "id") },
      include: { allocations: true, receipts: true, unmatched: true },
    });
    if (!payment) return fail(res, "Payment not found", 404);
    return ok(res, {
      ...payment,
      amount: toNumber(payment.amount),
      allocations: payment.allocations.map((a) => ({ ...a, amount: toNumber(a.amount) })),
      receipts: payment.receipts.map((r) => ({
        ...r,
        totalAmount: toNumber(r.totalAmount),
        cgst: toNumber(r.cgst),
        sgst: toNumber(r.sgst),
      })),
    });
  } catch (e) {
    return next(e);
  }
});
