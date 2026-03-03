import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { getStablecoin } from "./provider";
import { isValidPublicKey, circulatingSupply } from "../utils";

export const indexerRouter = Router();

// Event history requires a persistent off-chain database populated by a
// transaction listener.  This endpoint documents that limitation and points
// callers at the standard alternatives.
indexerRouter.get("/events/:mint", async (_req: Request, res: Response) => {
  res.json({
    message:
      "Event indexing requires a persistent database. Use Solana Explorer or an RPC provider's transaction history API for now.",
  });
});

// Returns on-chain stablecoin config (total minted/burned) for the given mint.
// Full token-account holder enumeration requires an off-chain index or a
// getProgramAccounts scan which is rate-limited on public RPCs.
indexerRouter.get("/holders/:mint", async (req: Request, res: Response) => {
  try {
    if (!isValidPublicKey(req.params.mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    const stablecoin = getStablecoin();
    const info = await stablecoin.getStablecoinInfo(
      new PublicKey(req.params.mint)
    );
    res.json({
      mint: req.params.mint,
      totalMinted: info.totalMinted.toString(),
      totalBurned: info.totalBurned.toString(),
      circulatingSupply: circulatingSupply(info.totalMinted, info.totalBurned).toString(),
      note: "Individual holder enumeration requires an off-chain index.",
    });
  } catch (error: any) {
    console.error("holders error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

indexerRouter.get(
  "/transactions/:mint",
  async (_req: Request, res: Response) => {
    res.json({
      message:
        "Transaction history requires a persistent database. Use Solana Explorer or an RPC provider's transaction history API for now.",
    });
  }
);
