import { Router, Request, Response } from "express";
import { Connection } from "@solana/web3.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl);
    const slot = await connection.getSlot();

    res.json({
      status: "healthy",
      version: "0.1.0",
      solana: {
        rpcUrl,
        currentSlot: slot,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      status: "unhealthy",
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

healthRouter.get("/ready", async (_req: Request, res: Response) => {
  const mintAddress = process.env.MINT_ADDRESS;
  if (!mintAddress) {
    res.status(503).json({
      ready: false,
      reason: "MINT_ADDRESS not configured",
    });
    return;
  }

  res.json({ ready: true });
});
