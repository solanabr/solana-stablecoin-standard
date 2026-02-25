import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { logger } from "../services/logger";

/**
 * API key authentication middleware.
 * Requires `x-api-key` header matching the configured API_KEY env var.
 * Uses timing-safe comparison to prevent timing side-channel attacks.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const apiKey = req.headers["x-api-key"];

  if (!process.env.API_KEY) {
    logger.error("API_KEY environment variable not configured");
    res.status(500).json({ error: "Server misconfigured: API key not set" });
    return;
  }

  if (
    !apiKey ||
    typeof apiKey !== "string" ||
    apiKey.length !== process.env.API_KEY.length ||
    !timingSafeEqual(Buffer.from(apiKey), Buffer.from(process.env.API_KEY))
  ) {
    logger.warn("Unauthorized request", {
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
    return;
  }

  next();
}
