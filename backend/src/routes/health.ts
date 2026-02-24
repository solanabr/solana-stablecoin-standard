import { Router, Request, Response } from "express";
import { logger } from "../services/logger";
import { getSolanaService } from "../services/solana";

const router = Router();

const startTime = Date.now();

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
router.get("/", async (_req: Request, res: Response) => {
  let solanaStatus: "connected" | "disconnected" = "disconnected";
  let slot: number | undefined;

  try {
    const solana = getSolanaService();
    slot = await solana.connection.getSlot();
    solanaStatus = "connected";
  } catch (err) {
    logger.warn("Health check: Solana connection failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  res.json({
    status: "ok",
    solana: solanaStatus,
    slot,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
