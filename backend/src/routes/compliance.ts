import { Router, Request, Response } from "express";
import { z } from "zod";
import { PublicKey, type ConfirmedSignatureInfo } from "@solana/web3.js";
import { logger } from "../services/logger";
import { getSolanaService } from "../services/solana";
import { publicKeySchema } from "../utils/validation";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleRouteError(res: Response, err: unknown, operation: string) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`${operation} failed`, { error: message });
  res.status(400).json({ error: message });
}

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
    handleRouteError(res, err, "Blacklist add");
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
    handleRouteError(res, err, "Blacklist remove");
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
    handleRouteError(res, err, "Compliance status check");
  }
});

// ---------------------------------------------------------------------------
// GET /compliance/audit-trail/:mint
// ---------------------------------------------------------------------------
const auditTrailQuerySchema = z.object({
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  before: z.string().optional(),
});

router.get("/audit-trail/:mint", async (req: Request, res: Response) => {
  const mintResult = publicKeySchema.safeParse(req.params.mint);
  if (!mintResult.success) {
    res.status(422).json({ error: "Invalid mint public key" });
    return;
  }

  const queryResult = auditTrailQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    res.status(422).json({ error: queryResult.error.flatten().fieldErrors });
    return;
  }

  try {
    const mint = new PublicKey(req.params.mint);
    const { action, limit, before } = queryResult.data;
    const solana = getSolanaService();

    // Derive config PDA to query its transaction history
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("sss-config"), mint.toBuffer()],
      solana.coreProgramId,
    );

    const sigOptions: { limit: number; before?: string } = { limit };
    if (before) {
      sigOptions.before = before;
    }

    const signatures = await solana.connection.getSignaturesForAddress(
      configPda,
      sigOptions,
    );

    // Map known event names from program logs
    const EVENT_NAMES = [
      "StablecoinInitialized", "TokensMinted", "TokensBurned",
      "AccountFrozen", "AccountThawed", "TokensSeized",
      "Paused", "Unpaused", "RoleGranted", "RoleRevoked",
      "ConfigUpdated", "AuthorityTransferred",
      "BlacklistAdded", "BlacklistRemoved",
    ];

    const entries = signatures.map((sig: ConfirmedSignatureInfo) => {
      const memo = sig.memo ?? "";
      const detectedAction = EVENT_NAMES.find((name) =>
        memo.includes(name) || (sig.err === null && memo === ""),
      );

      return {
        signature: sig.signature,
        action: detectedAction ?? "unknown",
        timestamp: sig.blockTime ?? null,
        slot: sig.slot,
        success: sig.err === null,
        memo: memo || null,
      };
    });

    const filtered = action
      ? entries.filter((e: { action: string }) => e.action.toLowerCase().includes(action.toLowerCase()))
      : entries;

    res.json({
      mint: mint.toBase58(),
      config: configPda.toBase58(),
      total: filtered.length,
      entries: filtered,
    });
  } catch (err) {
    handleRouteError(res, err, "Audit trail export");
  }
});

export { router as complianceRouter };
