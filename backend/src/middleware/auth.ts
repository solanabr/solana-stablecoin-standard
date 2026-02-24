import { Request, Response, NextFunction } from "express";
import { logger } from "../services/logger";

/**
 * API key authentication middleware.
 * Requires `x-api-key` header matching the configured API_KEY env var.
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

  if (!apiKey || apiKey !== process.env.API_KEY) {
    logger.warn("Unauthorized request", {
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
    return;
  }

  next();
}
