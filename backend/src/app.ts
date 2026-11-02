import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { studentsRouter } from "./modules/students/students.routes.js";
import { paymentsRouter, instalmentsRouter } from "./modules/payments/payments.routes.js";
import { refundsRouter } from "./modules/refunds/refunds.routes.js";
import { remindersRouter } from "./modules/reminders/reminders.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { riskRouter } from "./modules/risk/risk.routes.js";
import { reconciliationRouter } from "./modules/reconciliation/reconciliation.routes.js";
import { consentRouter } from "./modules/consent/consent.routes.js";
import { ok } from "./utils/response.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get("/health", (_req, res) =>
    ok(res, { status: "ok", service: "feeflow-api", time: new Date().toISOString() }),
  );

  app.use("/api/auth", authRouter);
  app.use("/api/students", studentsRouter);
  app.use("/api/instalments", instalmentsRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/refunds", refundsRouter);
  app.use("/api/reminders", remindersRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/risk", riskRouter);
  app.use("/api/reconciliation", reconciliationRouter);
  app.use("/api/consent", consentRouter);

  app.use(errorHandler);
  return app;
}
