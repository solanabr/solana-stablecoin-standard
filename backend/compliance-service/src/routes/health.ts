import { Router } from "express";
import { Logger } from "pino";

export function healthRoutes(logger: Logger): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    logger.debug("health check");
    res.json({
      status: "ok",
      service: "compliance-service",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  return router;
}
