import { Request, Response, NextFunction } from "express";

export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    next();
    return;
  }
  const key = req.headers["x-api-key"];
  if (key === apiKey) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
