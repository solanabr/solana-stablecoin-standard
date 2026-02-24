import { Router, Request, Response } from "express";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { logger } from "../services/logger";
import { getSolanaService } from "../services/solana";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const publicKeySchema = z.string().refine(
  (val) => {
    try {
      new PublicKey(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid Solana public key" },
);

const blacklistAddSchema = z.object({
  mint: publicKeySchema,
  address: publicKeySchema,
  reason: z
    .string()
    .min(1, "Reason is required")
    .max(128, "Reason must be 128 characters or fewer"),
});

const blacklistRemoveSchema = z.object({
  mint: publicKeySchema,
  address: publicKeySchema,
});

// ---------------------------------------------------------------------------
// POST /compliance/blacklist/add
// ---------------------------------------------------------------------------
router.post("/blacklist/add", async (req: Request, res: Response) => {
  const parsed = blacklistAddSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const { mint, address, reason } = parsed.data;
    const solana = getSolanaService();
    const sss = await solana.loadStablecoin(new PublicKey(mint));
    const signature = await sss.blacklist.add(
      new PublicKey(address),
      reason,
    );
    logger.info("Blacklist add completed", { mint, address, reason, signature });
    res.json({ success: true, signature });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Blacklist add failed", { error: message });
    res.status(400).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /compliance/blacklist/remove
// ---------------------------------------------------------------------------
router.post("/blacklist/remove", async (req: Request, res: Response) => {
  const parsed = blacklistRemoveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const { mint, address } = parsed.data;
    const solana = getSolanaService();
    const sss = await solana.loadStablecoin(new PublicKey(mint));
    const signature = await sss.blacklist.remove(new PublicKey(address));
    logger.info("Blacklist remove completed", { mint, address, signature });
    res.json({ success: true, signature });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Blacklist remove failed", { error: message });
    res.status(400).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /compliance/status/:mint/:address
// ---------------------------------------------------------------------------
router.get("/status/:mint/:address", async (req: Request, res: Response) => {
  const mintResult = publicKeySchema.safeParse(req.params.mint);
  const addressResult = publicKeySchema.safeParse(req.params.address);

  if (!mintResult.success || !addressResult.success) {
    res.status(422).json({ error: "Invalid mint or address public key" });
    return;
  }

  try {
    const mint = new PublicKey(req.params.mint);
    const address = new PublicKey(req.params.address);
    const solana = getSolanaService();
    const sss = await solana.loadStablecoin(mint);
    const blacklisted = await sss.blacklist.check(address);
    res.json({ blacklisted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Compliance status check failed", { error: message });
    res.status(400).json({ error: message });
  }
});

export { router as complianceRouter };
