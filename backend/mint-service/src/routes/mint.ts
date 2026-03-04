import { Router, Request, Response } from "express";
import { Logger } from "pino";
import { z } from "zod";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const MintRequestSchema = z.object({
  mint: z.string().min(32),
  recipient: z.string().min(32),
  amount: z.string().regex(/^\d+$/),
  reference: z.string().optional(), // idempotency key
});

const BurnRequestSchema = z.object({
  mint: z.string().min(32),
  fromTokenAccount: z.string().min(32),
  amount: z.string().regex(/^\d+$/),
  reference: z.string().optional(),
});

const StatusSchema = z.object({
  mint: z.string().min(32),
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function mintRoutes(logger: Logger): Router {
  const router = Router();
  const rpcUrl = process.env.RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  /** Load the authority keypair from the path set by KEYPAIR_PATH env var. */
  function loadKeypair(): Keypair {
    const path = process.env.KEYPAIR_PATH ?? "~/.config/solana/id.json";
    const resolved = path.replace("~", process.env.HOME ?? "/root");
    const secretKey = JSON.parse(readFileSync(resolved, "utf-8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  }

  // -------------------------------------------------------------------------
  // POST /v1/mint
  // Mint stablecoins to a recipient.
  // Body: { mint, recipient, amount, reference? }
  // -------------------------------------------------------------------------
  router.post("/mint", async (req: Request, res: Response) => {
    const parseResult = MintRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parseResult.error.issues,
      });
    }

    const { mint, recipient, amount, reference } = parseResult.data;
    logger.info({ mint, recipient, amount, reference }, "mint request received");

    try {
      const keypair = loadKeypair();

      // Dynamic import — SDK is only required at runtime after `anchor build`
      const { SolanaStablecoin } = await import("@stbr/sss-token").catch(() => {
        throw new Error("SDK not available — run `anchor build` first");
      });

      const stable = await SolanaStablecoin.load(
        connection,
        keypair,
        new PublicKey(mint),
      );
      const sig = await stable.mint({
        recipient: new PublicKey(recipient),
        amount: BigInt(amount),
      });

      logger.info({ sig, mint, recipient, amount }, "mint successful");
      return res.json({
        success: true,
        signature: sig,
        mint,
        recipient,
        amount,
        reference,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, mint, recipient }, "mint failed");
      return res.status(500).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/burn
  // Burn stablecoins from a token account.
  // Body: { mint, fromTokenAccount, amount, reference? }
  // -------------------------------------------------------------------------
  router.post("/burn", async (req: Request, res: Response) => {
    const parseResult = BurnRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parseResult.error.issues,
      });
    }

    const { mint, fromTokenAccount, amount, reference } = parseResult.data;
    logger.info({ mint, fromTokenAccount, amount }, "burn request received");

    try {
      const keypair = loadKeypair();
      const { SolanaStablecoin } = await import("@stbr/sss-token").catch(() => {
        throw new Error("SDK not available — run `anchor build` first");
      });

      const stable = await SolanaStablecoin.load(
        connection,
        keypair,
        new PublicKey(mint),
      );
      const sig = await stable.burn(
        new PublicKey(fromTokenAccount),
        BigInt(amount),
      );

      logger.info({ sig, mint, fromTokenAccount, amount }, "burn successful");
      return res.json({
        success: true,
        signature: sig,
        mint,
        fromTokenAccount,
        amount,
        reference,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, mint }, "burn failed");
      return res.status(500).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // GET /v1/status?mint=<pubkey>
  // Get stablecoin state and total supply.
  // -------------------------------------------------------------------------
  router.get("/status", async (req: Request, res: Response) => {
    const parseResult = StatusSchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Missing or invalid mint query param",
      });
    }

    const { mint } = parseResult.data;
    try {
      const keypair = loadKeypair();
      const { SolanaStablecoin } = await import("@stbr/sss-token").catch(() => {
        throw new Error("SDK not available");
      });

      const stable = await SolanaStablecoin.load(
        connection,
        keypair,
        new PublicKey(mint),
      );
      const [state, supply] = await Promise.all([
        stable.refresh(),
        stable.getTotalSupply(),
      ]);

      return res.json({
        mint,
        authority: state.authority.toBase58(),
        paused: state.paused,
        totalSupply: supply.toString(),
        preset: state.enableTransferHook ? "sss-2" : "sss-1",
        enablePermanentDelegate: state.enablePermanentDelegate,
        enableTransferHook: state.enableTransferHook,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
