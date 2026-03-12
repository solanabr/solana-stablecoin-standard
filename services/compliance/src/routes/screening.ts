import { Router } from "express";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";

export const screeningRouter = Router();

const ScreenSchema = z.object({
  address: z.string(),
});

/**
 * Placeholder for external sanctions screening integration.
 * In production, this would call Chainalysis, Elliptic, or TRM Labs APIs.
 * Returns a risk score + flags.
 */
screeningRouter.post("/check", async (req, res) => {
  const parsed = ScreenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    new PublicKey(parsed.data.address);
  } catch {
    return res.status(400).json({ error: "Invalid address" });
  }

  // Mock response — wire to real screening provider
  return res.json({
    address: parsed.data.address,
    riskScore: 0,
    flags: [],
    provider: "mock",
    ts: new Date().toISOString(),
    note: "Configure SCREENING_API_KEY and SCREENING_PROVIDER env vars for live screening.",
  });
});
