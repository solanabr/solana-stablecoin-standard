import { Router, Request, Response } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { MintBurnService } from "../services/mint-burn";
import { logger } from "../services/logger";

export const operationsRouter = Router();

const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
const programId = new PublicKey(
  process.env.PROGRAM_ID || "SSSToknXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz"
);
const connection = new Connection(rpcUrl, "confirmed");
const mintBurnService = new MintBurnService(connection, programId);

operationsRouter.post("/mint", async (req: Request, res: Response) => {
  try {
    const { amount, recipient } = req.body;
    if (!amount || !recipient) {
      res.status(400).json({ error: "amount and recipient are required" });
      return;
    }

    const request = await mintBurnService.createMintRequest(amount, recipient);
    logger.info("Mint request received via API", { requestId: request.id });

    res.status(201).json(request);
  } catch (err: any) {
    logger.error("Mint request failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.post("/burn", async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    if (!amount) {
      res.status(400).json({ error: "amount is required" });
      return;
    }

    const request = await mintBurnService.createBurnRequest(amount);
    logger.info("Burn request received via API", { requestId: request.id });

    res.status(201).json(request);
  } catch (err: any) {
    logger.error("Burn request failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.get("/request/:id", async (req: Request, res: Response) => {
  const request = mintBurnService.getRequest(req.params.id);
  if (!request) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  res.json(request);
});

operationsRouter.get("/requests", async (req: Request, res: Response) => {
  const type = req.query.type as "mint" | "burn" | undefined;
  const requests = mintBurnService.listRequests(type);
  res.json(requests);
});

operationsRouter.patch("/request/:id/status", async (req: Request, res: Response) => {
  try {
    const { status, signature, error: errorMsg } = req.body;
    const updated = await mintBurnService.updateRequestStatus(
      req.params.id,
      status,
      signature,
      errorMsg
    );

    if (!updated) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
