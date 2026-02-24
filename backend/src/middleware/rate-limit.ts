import rateLimit from "express-rate-limit";

/**
 * Create a rate limiter middleware.
 * Defaults: 30 requests per 60-second window.
 */
export function createRateLimiter(windowMs = 60_000, max = 30) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });
}
