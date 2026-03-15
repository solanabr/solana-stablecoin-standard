import { Request, Response, NextFunction } from "express";
import { SSSError } from "../../../sdk/src";

/**
 * Express error-handling middleware.
 * Catches SSSError instances and returns structured JSON responses.
 * Falls back to a generic 500 for unknown errors.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof SSSError) {
    res.status(400).json({
      error: {
        code: err.code,
        name: err.errorName,
        message: err.message,
      },
    });
    return;
  }

  console.error("[Backend Error]", err);

  res.status(500).json({
    error: {
      code: -1,
      name: "InternalServerError",
      message: err.message || "An unexpected error occurred",
    },
  });
}
