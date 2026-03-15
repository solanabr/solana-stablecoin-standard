import { NextFunction, Request, RequestHandler, Response } from "express";

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 100;

interface RateLimitEntry {
  timestamps: number[];
}

function parseEnvNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createRateLimitMiddleware(): RequestHandler {
  const windowMs = parseEnvNumber(
    process.env.RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_WINDOW_MS
  );
  const maxRequests = parseEnvNumber(process.env.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX);
  const requestLog = new Map<string, RateLimitEntry>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || "unknown";
    const windowStart = now - windowMs;
    const entry = requestLog.get(key) || { timestamps: [] };

    entry.timestamps = entry.timestamps.filter((timestamp) => timestamp > windowStart);

    if (entry.timestamps.length >= maxRequests) {
      const retryAfterMs = Math.max(
        0,
        windowMs - (now - (entry.timestamps[0] || windowStart))
      );
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      requestLog.set(key, entry);
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests",
          retryAfter: retryAfterSeconds,
        },
      });
      return;
    }

    entry.timestamps.push(now);
    requestLog.set(key, entry);
    next();
  };
}

export const rateLimitMiddleware = createRateLimitMiddleware();
