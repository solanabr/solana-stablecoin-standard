import { Request, Response, NextFunction } from "express";
import { redis } from "../../shared/redis";

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW || "900000"); // 15 minutes
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || "100");

export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const ip = req.ip || "unknown";
  const key = `rate_limit:${ip}`;

  try {
    const current = await redis.get(key);
    const requests = current ? parseInt(current) : 0;

    if (requests >= MAX_REQUESTS) {
      return res.status(429).json({
        error: "Too many requests",
        retryAfter: Math.ceil(WINDOW_MS / 1000),
      });
    }

    await redis.multi().incr(key).pexpire(key, WINDOW_MS).exec();

    res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
    res.setHeader(
      "X-RateLimit-Remaining",
      Math.max(0, MAX_REQUESTS - requests - 1)
    );

    next();
  } catch (error) {
    console.error("Rate limiter error:", error);
    next();
  }
}
