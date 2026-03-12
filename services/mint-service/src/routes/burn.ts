import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../logger";

export const burnRouter = Router();

const BurnRequestSchema = z.object({
  tokenAccount: z.string(),
  amount: z.string(),
  memo: z.string().optional(),
});

const requests: Record<string, any> = {};

burnRouter.post("/request", async (req, res) => {
  const parsed = BurnRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = uuidv4();
  requests[id] = {
    id,
    status: "pending",
    tokenAccount: parsed.data.tokenAccount,
    amount: parsed.data.amount,
    memo: parsed.data.memo ?? null,
    createdAt: new Date().toISOString(),
  };

  logger.info("Burn request created", { id });
  return res.status(201).json({ id, status: "pending" });
});

burnRouter.get("/request/:id", (req, res) => {
  const request = requests[req.params.id];
  if (!request) return res.status(404).json({ error: "Not found" });
  return res.json(request);
});
