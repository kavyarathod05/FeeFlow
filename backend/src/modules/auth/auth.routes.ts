import { Router } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { addMinutes } from "date-fns";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { requireAuth, requireRole, signToken } from "../../middleware/auth.js";
import { ok, fail } from "../../utils/response.js";

export const authRouter = Router();

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many OTP requests" } },
});

function hashOtp(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

authRouter.post("/parent/request-otp", otpLimiter, async (req, res, next) => {
  try {
    const { phone } = z.object({ phone: z.string().min(10).max(15) }).parse(req.body);
    const parent = await prisma.parent.findUnique({
      where: { phone },
      include: { user: true },
    });
    if (!parent) return fail(res, "Parent not found for this phone", 404);

    const code = env.OTP_DEMO_MODE ? env.OTP_DEMO_CODE : String(randomInt(100000, 999999));
    await prisma.otpCode.create({
      data: {
        userId: parent.userId,
        phone,
        codeHash: hashOtp(code),
        expiresAt: addMinutes(new Date(), env.OTP_EXPIRY_MINUTES),
      },
    });

    // Demo mode: return hint only in non-production demo; never log as real SMS
    const demoHint =
      env.OTP_DEMO_MODE && env.NODE_ENV !== "production"
        ? { demoOtp: code, note: "OTP_DEMO_MODE — mock delivery only" }
        : undefined;

    if (env.OTP_DEMO_MODE) {
      console.info(`[FeeFlow OTP demo] phone=${phone} code=${code} (mock, not SMS)`);
    }

    return ok(res, {
      message: "OTP sent via mock channel",
      expiresInMinutes: env.OTP_EXPIRY_MINUTES,
      ...demoHint,
    });
  } catch (e) {
    return next(e);
  }
});

authRouter.post("/parent/verify-otp", otpLimiter, async (req, res, next) => {
  try {
    const { phone, code } = z
      .object({ phone: z.string().min(10), code: z.string().min(4).max(8) })
      .parse(req.body);

    const parent = await prisma.parent.findUnique({
      where: { phone },
      include: { user: true },
    });
    if (!parent) return fail(res, "Invalid OTP", 401);

    const otp = await prisma.otpCode.findFirst({
      where: { userId: parent.userId, phone, consumed: false },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) return fail(res, "Invalid OTP", 401);
    if (otp.expiresAt < new Date()) return fail(res, "Expired OTP", 401);
    if (otp.attempts >= env.OTP_MAX_ATTEMPTS) return fail(res, "Invalid OTP", 401);

    if (otp.codeHash !== hashOtp(code)) {
      await prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      return fail(res, "Invalid OTP", 401);
    }

    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumed: true },
    });

    const token = signToken({
      id: parent.userId,
      role: "PARENT",
      parentId: parent.id,
      name: parent.user.name,
    });

    return ok(res, {
      token,
      user: { id: parent.userId, role: "PARENT", name: parent.user.name, parentId: parent.id },
    });
  } catch (e) {
    return next(e);
  }
});

authRouter.post("/accounts/login", async (req, res, next) => {
  try {
    const { email, password } = z
      .object({ email: z.string().email(), password: z.string().min(6) })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== "ACCOUNTS" || !user.passwordHash) {
      return fail(res, "Invalid credentials", 401);
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return fail(res, "Invalid credentials", 401);

    const token = signToken({ id: user.id, role: "ACCOUNTS", name: user.name });
    return ok(res, {
      token,
      user: { id: user.id, role: "ACCOUNTS", name: user.name, email: user.email },
    });
  } catch (e) {
    return next(e);
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  return ok(res, { user: req.user });
});

authRouter.get(
  "/accounts-only-check",
  requireAuth,
  requireRole("ACCOUNTS"),
  (_req, res) => ok(res, { ok: true }),
);
