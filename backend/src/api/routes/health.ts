import { Router } from "express";
import { Connection, clusterApiUrl } from "@solana/web3.js";

const router = Router();

router.get("/", async (req, res) => {
  res.json({
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "sss-token-api",
      version: "0.1.0",
    },
  });
});

router.get("/solana", async (req, res) => {
  try {
    const network = process.env.SOLANA_NETWORK || "devnet";
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"),
      "confirmed"
    );

    const slot = await connection.getSlot();
    const blockTime = await connection.getBlockTime(slot);

    res.json({
      success: true,
      data: {
        network,
        slot,
        blockTime,
        rpc: process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"),
      },
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      error: "Solana connection failed",
      message: error.message,
    });
  }
});

export { router as healthRouter };
