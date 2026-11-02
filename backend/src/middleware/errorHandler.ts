import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { fail } from "../utils/response.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return fail(res, "Validation failed", 400, err.flatten());
  }
  if (err instanceof Error) {
    const status = /not found/i.test(err.message)
      ? 404
      : /forbidden|denied/i.test(err.message)
        ? 403
        : /unauthorized|invalid otp|expired otp|invalid webhook/i.test(err.message)
          ? 401
          : 400;
    return fail(res, err.message, status);
  }
  return fail(res, "Internal server error", 500);
}
