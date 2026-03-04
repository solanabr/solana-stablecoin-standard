import { Router, Request, Response } from "express";
import { Logger } from "pino";
import { z } from "zod";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const BlacklistAddSchema = z.object({
  mint: z.string().min(32),
  address: z.string().min(32),
  reason: z.string().min(1).max(128),
});

const BlacklistCheckSchema = z.object({
  mint: z.string().min(32),
  address: z.string().min(32),
});

const SeizeSchema = z.object({
  mint: z.string().min(32),
  fromTokenAccount: z.string().min(32),
  toTokenAccount: z.string().min(32),
  amount: z.string().regex(/^\d+$/),
});

const AuditLogSchema = z.object({
  mint: z.string().min(32),
  action: z
    .enum(["blacklisted", "unblacklisted", "seized", "frozen", "minted", "burned"])
    .optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 100)),
});

// ---------------------------------------------------------------------------
// Audit log types
// ---------------------------------------------------------------------------

interface AuditEntry {
  id: string;
  mint: string;
  action: string;
  address?: string;
  amount?: string;
  reason?: string;
  performedBy: string;
  signature?: string;
  timestamp: string;
}

// In-memory audit log — replace with a persistent DB in production
const auditLog: AuditEntry[] = [];

// ---------------------------------------------------------------------------
// Helper: load keypair from KEYPAIR_PATH env var
// ---------------------------------------------------------------------------

function loadKeypair(): Keypair {
  const path = process.env.KEYPAIR_PATH ?? "~/.config/solana/id.json";
  const resolved = path.replace("~", process.env.HOME ?? "/root");
  const secretKey = JSON.parse(readFileSync(resolved, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function complianceRoutes(logger: Logger): Router {
  const router = Router();
  const rpcUrl = process.env.RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  // -------------------------------------------------------------------------
  // POST /v1/compliance/blacklist
  // Add address to blacklist on-chain.
  // Body: { mint, address, reason }
  // -------------------------------------------------------------------------
  router.post("/blacklist", async (req: Request, res: Response) => {
    const parseResult = BlacklistAddSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parseResult.error.issues,
      });
    }

    const { mint, address, reason } = parseResult.data;
    logger.info({ mint, address, reason }, "blacklist add request");

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
      const sig = await stable.compliance.blacklistAdd(
        new PublicKey(address),
        reason,
      );

      const entry: AuditEntry = {
        id: `blacklist-${Date.now()}`,
        mint,
        action: "blacklisted",
        address,
        reason,
        performedBy: keypair.publicKey.toBase58(),
        signature: sig as string,
        timestamp: new Date().toISOString(),
      };
      auditLog.push(entry);

      logger.info({ sig, address }, "blacklisted successfully");
      return res.json({ success: true, ...entry });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, address }, "blacklist add failed");
      return res.status(500).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /v1/compliance/blacklist
  // Remove address from blacklist.
  // Body: { mint, address }
  // -------------------------------------------------------------------------
  router.delete("/blacklist", async (req: Request, res: Response) => {
    const parseResult = BlacklistCheckSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const { mint, address } = parseResult.data;
    logger.info({ mint, address }, "blacklist remove request");

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
      const sig = await stable.compliance.blacklistRemove(new PublicKey(address));

      const entry: AuditEntry = {
        id: `unblacklist-${Date.now()}`,
        mint,
        action: "unblacklisted",
        address,
        performedBy: keypair.publicKey.toBase58(),
        signature: sig as string,
        timestamp: new Date().toISOString(),
      };
      auditLog.push(entry);

      logger.info({ sig, address }, "un-blacklisted successfully");
      return res.json({ success: true, ...entry });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, address }, "blacklist remove failed");
      return res.status(500).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // GET /v1/compliance/blacklist?mint=<pubkey>&address=<pubkey>
  // Check whether an address is blacklisted.
  // -------------------------------------------------------------------------
  router.get("/blacklist", async (req: Request, res: Response) => {
    const parseResult = BlacklistCheckSchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Missing or invalid mint / address query params",
      });
    }

    const { mint, address } = parseResult.data;
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
      const [blacklisted, entry] = await Promise.all([
        stable.compliance.isBlacklisted(new PublicKey(address)),
        stable.compliance.getBlacklistEntry(new PublicKey(address)),
      ]);

      return res.json({ mint, address, blacklisted, entry });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/compliance/seize
  // Transfer tokens from a blacklisted account using the permanent delegate.
  // Body: { mint, fromTokenAccount, toTokenAccount, amount }
  // -------------------------------------------------------------------------
  router.post("/seize", async (req: Request, res: Response) => {
    const parseResult = SeizeSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parseResult.error.issues,
      });
    }

    const { mint, fromTokenAccount, toTokenAccount, amount } = parseResult.data;
    logger.info({ mint, fromTokenAccount, toTokenAccount, amount }, "seize request");

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
      const sig = await stable.compliance.seize({
        from: new PublicKey(fromTokenAccount),
        to: new PublicKey(toTokenAccount),
        amount: BigInt(amount),
      });

      const entry: AuditEntry = {
        id: `seize-${Date.now()}`,
        mint,
        action: "seized",
        address: fromTokenAccount,
        amount,
        performedBy: keypair.publicKey.toBase58(),
        signature: sig as string,
        timestamp: new Date().toISOString(),
      };
      auditLog.push(entry);

      logger.info({ sig, fromTokenAccount, amount }, "seizure successful");
      return res.json({ success: true, ...entry });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message }, "seizure failed");
      return res.status(500).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // GET /v1/compliance/audit-log?mint=<pubkey>&action=<type>&limit=<n>
  // Export the audit trail, most recent entries first.
  // -------------------------------------------------------------------------
  router.get("/audit-log", async (req: Request, res: Response) => {
    const parseResult = AuditLogSchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Missing or invalid query params",
        details: parseResult.error.issues,
      });
    }

    const { mint, action, limit } = parseResult.data;

    let entries = auditLog.filter((e) => e.mint === mint);
    if (action) {
      entries = entries.filter((e) => e.action === action);
    }
    // Return the most-recent `limit` entries, newest first
    entries = entries.slice(-limit).reverse();

    return res.json({
      mint,
      total: entries.length,
      entries,
    });
  });

  return router;
}
