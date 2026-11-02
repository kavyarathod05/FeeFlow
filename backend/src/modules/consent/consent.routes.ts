import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { ok, fail } from "../../utils/response.js";

export const consentRouter = Router();

const CONSENT_VERSION = "dpdp-demo-v1";

consentRouter.get("/", requireAuth, requireRole("PARENT"), async (req, res, next) => {
  try {
    const rows = await prisma.parentalConsent.findMany({
      where: { parentId: req.user!.parentId },
      include: { student: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, {
      disclaimer:
        "MVP demonstration consent workflow. Production verifiable parental consent under DPDP Act 2023 requires a legally reviewed, appropriately verified process.",
      consents: rows,
    });
  } catch (e) {
    return next(e);
  }
});

consentRouter.post("/", requireAuth, requireRole("PARENT"), async (req, res, next) => {
  try {
    const body = z
      .object({
        studentId: z.string(),
        given: z.boolean(),
      })
      .parse(req.body);

    const link = await prisma.parentStudent.findUnique({
      where: {
        parentId_studentId: { parentId: req.user!.parentId!, studentId: body.studentId },
      },
    });
    if (!link) return fail(res, "Forbidden", 403);

    const consent = await prisma.parentalConsent.upsert({
      where: {
        parentId_studentId_version: {
          parentId: req.user!.parentId!,
          studentId: body.studentId,
          version: CONSENT_VERSION,
        },
      },
      create: {
        parentId: req.user!.parentId!,
        studentId: body.studentId,
        version: CONSENT_VERSION,
        status: body.given ? "GIVEN" : "NOT_GIVEN",
        method: "in_app_checkbox_demo",
        consentedAt: body.given ? new Date() : null,
      },
      update: {
        status: body.given ? "GIVEN" : "WITHDRAWN",
        method: "in_app_checkbox_demo",
        consentedAt: body.given ? new Date() : null,
      },
    });

    return ok(res, {
      consent,
      disclaimer:
        "Stored as demo consent only — not production-grade DPDP verifiable consent.",
    });
  } catch (e) {
    return next(e);
  }
});
