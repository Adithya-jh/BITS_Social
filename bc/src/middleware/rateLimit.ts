import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../types";
import { redis } from "../infrastructure/redisClient";

type RateLimitOptions = {
  keyPrefix: string;
  windowMs: number;
  maxRequests: number;
  getIdentifier?: (req: AuthenticatedRequest) => string | null | Promise<string | null>;
  skip?: (req: AuthenticatedRequest) => boolean;
};

export function createRateLimiter(options: RateLimitOptions) {
  const { keyPrefix, windowMs, maxRequests } = options;

  return async function rateLimiter(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    if (options.skip && options.skip(req)) {
      return next();
    }

    const identifier =
      (options.getIdentifier ? await options.getIdentifier(req) : null) ??
      req.ip ??
      req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ??
      "unknown";

    const cacheKey = `${keyPrefix}:${identifier}`;

    const results = await redis
      .multi()
      .incr(cacheKey)
      .pttl(cacheKey)
      .exec();

    const currentCount = results?.[0]?.[1] as number | undefined;
    let ttlMs = results?.[1]?.[1] as number | undefined;

    if (currentCount === undefined) {
      return next();
    }

    if (currentCount === 1 || ttlMs === undefined || ttlMs < 0) {
      await redis.pexpire(cacheKey, windowMs);
      ttlMs = windowMs;
    }

    if (currentCount > maxRequests) {
      const retryAfterMs = ttlMs ?? windowMs;
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
      return res
        .status(429)
        .json({ error: "Too many requests", retryAfterMs });
    }

    return next();
  };
}
