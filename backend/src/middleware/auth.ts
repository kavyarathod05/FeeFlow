import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { fail } from "../utils/response.js";

export type AuthUser = {
  id: string;
  role: "PARENT" | "ACCOUNTS";
  parentId?: string;
  name: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return fail(res, "Authentication required", 401);
  }
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as AuthUser;
    req.user = payload;
    return next();
  } catch {
    return fail(res, "Invalid or expired token", 401);
  }
}

export function requireRole(...roles: Array<"PARENT" | "ACCOUNTS">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }
    return next();
  };
}
