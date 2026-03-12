import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { PublicKey } from "@solana/web3.js";
import { logger } from "../logger";
import { auditLog } from "./audit";

export const blacklistRouter = Router();

const AddSchema = z.object({
  mint: z.string(),
  address: z.string(),
  reason: z.string().min(1).max(128),
  operatorId: z.string().optional(),
});

const RemoveSchema = z.object({
  mint: z.string(),
  address: z.string(),
  operatorId: z.string().optional(),
});

// Off-chain pending queue — the compliance officer reviews before the on-chain tx fires.
const pending: Record<string, any> = {};

blacklistRouter.post("/add", async (req, res) => {
  const parsed = AddSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    new PublicKey(parsed.data.address);
    new PublicKey(parsed.data.mint);
  } catch {
    return res.status(400).json({ error: "Invalid Solana address" });
  }

  const id = uuidv4();
  const entry = {
    id,
    type: "blacklist_add",
    ...parsed.data,
    status: "pending_review",
    createdAt: new Date().toISOString(),
  };
  pending[id] = entry;

  auditLog({
    action: "blacklist_add_requested",
    id,
    address: parsed.data.address,
    reason: parsed.data.reason,
    operator: parsed.data.operatorId ?? "unknown",
  });

  logger.info("Blacklist add request created", { id, address: parsed.data.address });
  return res.status(201).json({ id, status: "pending_review" });
});

blacklistRouter.post("/:id/approve", (req, res) => {
  const item = pending[req.params.id];
  if (!item) return res.status(404).json({ error: "Not found" });
  if (item.status !== "pending_review") return res.status(409).json({ error: `Already ${item.status}` });

  item.status = "approved";
  item.approvedAt = new Date().toISOString();

  auditLog({ action: "blacklist_add_approved", id: item.id, address: item.address });

  // TODO: submit on-chain tx via SSS SDK
  logger.info("Blacklist item approved, queued for on-chain submission", { id: item.id });
  return res.json(item);
});

blacklistRouter.get("/", (_req, res) => {
  return res.json(Object.values(pending));
});
