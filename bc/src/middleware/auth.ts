import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import type { AuthenticatedRequest } from "../types";
import { env } from "../env";

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      sub: string | number;
    };
    const sub =
      typeof payload.sub === "string" ? Number.parseInt(payload.sub, 10) : payload.sub;

    if (Number.isNaN(sub)) {
      return res.status(401).json({ error: "Invalid token subject" });
    }

    req.userId = sub;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
