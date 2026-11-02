import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  OTP_DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  OTP_DEMO_CODE: z.string().default("246810"),
  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  APP_BASE_URL: z.string().default("http://localhost:5173"),
  API_BASE_URL: z.string().default("http://localhost:4000"),
  PAYMENT_WEBHOOK_SECRET: z.string().default("feeflow-mock-webhook-secret"),
  GST_RATE: z.coerce.number().default(0.18),
  TZ: z.string().default("Asia/Kolkata"),
});

export const env = envSchema.parse(process.env);
