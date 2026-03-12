import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { PublicKey } from "@solana/web3.js";
import { logger } from "../logger";

export const mintRouter = Router();

const MintRequestSchema = z.object({
  recipient: z.string(),
  amount: z.string(), // bigint as string to avoid JS precision issues
  memo: z.string().optional(),
});

// In-memory store for demo — replace with a proper DB in production
const requests: Record<string, any> = {};

mintRouter.post("/request", async (req, res) => {
  const parsed = MintRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  // Validate recipient is a valid Solana pubkey
  try {
    new PublicKey(parsed.data.recipient);
  } catch {
    return res.status(400).json({ error: "Invalid recipient address" });
  }

  const id = uuidv4();
  requests[id] = {
    id,
    status: "pending",
    recipient: parsed.data.recipient,
    amount: parsed.data.amount,
    memo: parsed.data.memo ?? null,
    createdAt: new Date().toISOString(),
  };

  logger.info("Mint request created", { id, recipient: parsed.data.recipient, amount: parsed.data.amount });
  return res.status(201).json({ id, status: "pending" });
});

mintRouter.get("/request/:id", (req, res) => {
  const request = requests[req.params.id];
  if (!request) return res.status(404).json({ error: "Request not found" });
  return res.json(request);
});

mintRouter.post("/request/:id/execute", async (req, res) => {
  const request = requests[req.params.id];
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "pending") {
    return res.status(409).json({ error: `Request is already ${request.status}` });
  }

  // Here we would call the on-chain mint instruction.
  // For the service layer demo, we mark it as processing.
  request.status = "processing";
  request.updatedAt = new Date().toISOString();

  logger.info("Mint request executing", { id: req.params.id });

  // TODO: wire to SolanaStablecoin.mintTokens() with the service keypair
  // Simulate success for now
  request.status = "completed";
  request.txSignature = "simulated_" + Date.now();
  request.completedAt = new Date().toISOString();

  logger.info("Mint request completed", { id: req.params.id, sig: request.txSignature });
  return res.json(request);
});
