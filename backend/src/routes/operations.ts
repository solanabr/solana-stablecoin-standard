import { Router, Request, Response } from "express";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { logger } from "../services/logger";
import { getSolanaService } from "../services/solana";
import { getComplianceProvider } from "../services/compliance-provider";
import { publicKeySchema } from "../utils/validation";

const router = Router();

const mintToSchema = z.object({
  mint: publicKeySchema,
  to: publicKeySchema,
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a numeric string")
    .refine((v) => BigInt(v) > 0n, "Amount must be positive"),
});

const burnSchema = z.object({
  mint: publicKeySchema,
  from: publicKeySchema,
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a numeric string")
    .refine((v) => BigInt(v) > 0n, "Amount must be positive"),
});

const accountActionSchema = z.object({
  mint: publicKeySchema,
  account: publicKeySchema,
});

const mintOnlySchema = z.object({
  mint: publicKeySchema,
});

const seizeSchema = z.object({
  mint: publicKeySchema,
  from: publicKeySchema,
  to: publicKeySchema,
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a numeric string")
    .refine((v) => BigInt(v) > 0n, "Amount must be positive"),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleRouteError(res: Response, err: unknown, operation: string) {
  const message = err instanceof Error ? err.message : String(err);
  const isClientError = message.includes("Account does not exist")
    || message.includes("Invalid")
    || message.includes("Unauthorized")
    || message.includes("already exists");
  const status = isClientError ? 400 : 500;
  logger.error(`${operation} failed`, { error: message, status });
  res.status(status).json({ error: isClientError ? message : "Internal server error" });
}

// ---------------------------------------------------------------------------
// POST /operations/mint
// ---------------------------------------------------------------------------
router.post("/mint", async (req: Request, res: Response) => {
  const parsed = mintToSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const { mint, to, amount } = parsed.data;

    // Step: VERIFY — compliance screening
    const compliance = getComplianceProvider();
    const screening = await compliance.screenTransaction({
      to,
      amount,
      action: "mint",
    });
    if (!screening.approved) {
      logger.warn("Mint blocked by compliance", { mint, to, amount, reason: screening.reason });
      res.status(403).json({ error: "Compliance check failed", reason: screening.reason });
      return;
    }

    // Step: EXECUTE — on-chain mint
    const solana = getSolanaService();
    const sss = await solana.loadStablecoin(new PublicKey(mint));
    const signature = await sss.mintTokens(
      new PublicKey(to),
      BigInt(amount),
    );

    // Step: LOG — record result with compliance metadata
    logger.info("Mint operation completed", { mint, to, amount, signature });
    res.json({ success: true, signature, compliance: { provider: screening.provider, checkedAt: screening.checkedAt } });
  } catch (err) {
    handleRouteError(res, err, "Mint");
  }
});

// ---------------------------------------------------------------------------
// POST /operations/burn
// ---------------------------------------------------------------------------
router.post("/burn", async (req: Request, res: Response) => {
  const parsed = burnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const { mint, from, amount } = parsed.data;

    // Step: VERIFY — compliance screening
    const compliance = getComplianceProvider();
    const screening = await compliance.screenTransaction({
      from,
      to: from, // burn target is the source account
      amount,
      action: "burn",
    });
    if (!screening.approved) {
      logger.warn("Burn blocked by compliance", { mint, from, amount, reason: screening.reason });
      res.status(403).json({ error: "Compliance check failed", reason: screening.reason });
      return;
    }

    // Step: EXECUTE — on-chain burn
    const solana = getSolanaService();
    const sss = await solana.loadStablecoin(new PublicKey(mint));
    const signature = await sss.burn(
      new PublicKey(from),
      BigInt(amount),
    );

    // Step: LOG — record result with compliance metadata
    logger.info("Burn operation completed", { mint, from, amount, signature });
    res.json({ success: true, signature, compliance: { provider: screening.provider, checkedAt: screening.checkedAt } });
  } catch (err) {
    handleRouteError(res, err, "Burn");
  }
});

// ---------------------------------------------------------------------------
// POST /operations/freeze
// ---------------------------------------------------------------------------
router.post("/freeze", async (req: Request, res: Response) => {
  const parsed = accountActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const { mint, account } = parsed.data;
    const solana = getSolanaService();
    const sss = await solana.loadStablecoin(new PublicKey(mint));
    const signature = await sss.freeze(new PublicKey(account));
    logger.info("Freeze operation completed", { mint, account, signature });
    res.json({ success: true, signature });
  } catch (err) {
    handleRouteError(res, err, "Freeze");
  }
});

// ---------------------------------------------------------------------------
// POST /operations/thaw
// ---------------------------------------------------------------------------
router.post("/thaw", async (req: Request, res: Response) => {
  const parsed = accountActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const { mint, account } = parsed.data;
    const solana = getSolanaService();
    const sss = await solana.loadStablecoin(new PublicKey(mint));
    const signature = await sss.thaw(new PublicKey(account));
    logger.info("Thaw operation completed", { mint, account, signature });
    res.json({ success: true, signature });
  } catch (err) {
    handleRouteError(res, err, "Thaw");
  }
});

// ---------------------------------------------------------------------------
// POST /operations/pause
// ---------------------------------------------------------------------------
router.post("/pause", async (req: Request, res: Response) => {
  const parsed = mintOnlySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const { mint } = parsed.data;
    const solana = getSolanaService();
    const sss = await solana.loadStablecoin(new PublicKey(mint));
    const signature = await sss.pause();
    logger.info("Pause operation completed", { mint, signature });
    res.json({ success: true, signature });
  } catch (err) {
    handleRouteError(res, err, "Pause");
  }
});

// ---------------------------------------------------------------------------
// POST /operations/unpause
// ---------------------------------------------------------------------------
router.post("/unpause", async (req: Request, res: Response) => {
  const parsed = mintOnlySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const { mint } = parsed.data;
    const solana = getSolanaService();
    const sss = await solana.loadStablecoin(new PublicKey(mint));
    const signature = await sss.unpause();
    logger.info("Unpause operation completed", { mint, signature });
    res.json({ success: true, signature });
  } catch (err) {
    handleRouteError(res, err, "Unpause");
  }
});

// ---------------------------------------------------------------------------
// POST /operations/seize
// ---------------------------------------------------------------------------
router.post("/seize", async (req: Request, res: Response) => {
  const parsed = seizeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const { mint, from, to, amount } = parsed.data;
    const solana = getSolanaService();
    const sss = await solana.loadStablecoin(new PublicKey(mint));
    const signature = await sss.seize(
      new PublicKey(from),
      new PublicKey(to),
      BigInt(amount),
    );
    logger.info("Seize operation completed", { mint, from, to, amount, signature });
    res.json({ success: true, signature });
  } catch (err) {
    handleRouteError(res, err, "Seize");
  }
});

export { router as operationsRouter };
