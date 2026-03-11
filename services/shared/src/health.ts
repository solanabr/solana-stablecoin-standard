import { Router, Request, Response } from "express";
import { checkDbHealth } from "./db";
import { checkRedisHealth } from "./redis";
import { Connection } from "@solana/web3.js";

interface HealthOptions {
  serviceName: string;
  version?: string;
  rpcUrl?: string;
  checkRedis?: boolean;
}

export function createHealthRouter(opts: HealthOptions): Router {
  const router = Router();
  const startTime = Date.now();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: opts.serviceName,
      version: opts.version ?? "0.1.0",
      uptime: Math.floor((Date.now() - startTime) / 1000),
    });
  });

  router.get("/ready", async (_req: Request, res: Response) => {
    const checks: Record<string, boolean> = {};

    checks.db = await checkDbHealth();

    if (opts.checkRedis) {
      checks.redis = await checkRedisHealth();
    }

    if (opts.rpcUrl) {
      try {
        const conn = new Connection(opts.rpcUrl, "confirmed");
        await conn.getSlot();
        checks.rpc = true;
      } catch {
        checks.rpc = false;
      }
    }

    const allHealthy = Object.values(checks).every(Boolean);
    const statusCode = allHealthy ? 200 : 503;

    res.status(statusCode).json({
      status: allHealthy ? "ready" : "not_ready",
      checks,
    });
  });

  return router;
}
