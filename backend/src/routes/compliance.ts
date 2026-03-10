import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { config } from "../config";
import { createLogger } from "../logger";
import { insertAuditEntry, queryAuditTrail, getDb } from "../services/database";

const log = createLogger("routes:compliance");
const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function isValidPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function deriveBlacklistPda(
  mint: PublicKey,
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), mint.toBuffer(), wallet.toBuffer()],
    new PublicKey(config.programs.sssHook)
  );
}

// ── POST /api/blacklist/add ─────────────────────────────────────────────────

router.post("/blacklist/add", async (req: Request, res: Response) => {
  try {
    const { mint: mintAddress, wallet, reason } = req.body;

    if (!mintAddress || !isValidPublicKey(mintAddress)) {
      res.status(400).json({ error: "Invalid or missing mint address" });
      return;
    }
    if (!wallet || !isValidPublicKey(wallet)) {
      res.status(400).json({ error: "Invalid or missing wallet address" });
      return;
    }
    if (!reason || typeof reason !== "string" || reason.length === 0) {
      res.status(400).json({ error: "Missing or empty reason" });
      return;
    }
    if (reason.length > 64) {
      res.status(400).json({ error: "Reason must be 64 characters or fewer" });
      return;
    }

    const mint = new PublicKey(mintAddress);
    const walletPk = new PublicKey(wallet);
    const [blacklistPda] = deriveBlacklistPda(mint, walletPk);

    log.info(`Blacklist add request: wallet=${wallet}, mint=${mintAddress}`);

    insertAuditEntry("blacklist_add", "api", wallet, {
      mint: mintAddress,
      reason,
      blacklistPda: blacklistPda.toBase58(),
    });

    res.json({
      status: "accepted",
      wallet,
      mint: mintAddress,
      reason,
      accounts: {
        blacklistEntry: blacklistPda.toBase58(),
      },
      message:
        "Blacklist add accepted. Submit the on-chain transaction using the sss-hook addToBlacklist instruction.",
    });
  } catch (err) {
    log.error("Blacklist add error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// ── POST /api/blacklist/remove ──────────────────────────────────────────────

router.post("/blacklist/remove", async (req: Request, res: Response) => {
  try {
    const { mint: mintAddress, wallet } = req.body;

    if (!mintAddress || !isValidPublicKey(mintAddress)) {
      res.status(400).json({ error: "Invalid or missing mint address" });
      return;
    }
    if (!wallet || !isValidPublicKey(wallet)) {
      res.status(400).json({ error: "Invalid or missing wallet address" });
      return;
    }

    const mint = new PublicKey(mintAddress);
    const walletPk = new PublicKey(wallet);
    const [blacklistPda] = deriveBlacklistPda(mint, walletPk);

    log.info(`Blacklist remove request: wallet=${wallet}, mint=${mintAddress}`);

    insertAuditEntry("blacklist_remove", "api", wallet, {
      mint: mintAddress,
      blacklistPda: blacklistPda.toBase58(),
    });

    res.json({
      status: "accepted",
      wallet,
      mint: mintAddress,
      accounts: {
        blacklistEntry: blacklistPda.toBase58(),
      },
      message:
        "Blacklist remove accepted. Submit the on-chain transaction using the sss-hook removeFromBlacklist instruction.",
    });
  } catch (err) {
    log.error("Blacklist remove error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// ── GET /api/blacklist/check/:wallet ────────────────────────────────────────

router.get("/blacklist/check/:wallet", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    const { mint: mintAddress } = req.query;

    if (!isValidPublicKey(wallet)) {
      res.status(400).json({ error: "Invalid wallet address" });
      return;
    }
    if (!mintAddress || typeof mintAddress !== "string" || !isValidPublicKey(mintAddress)) {
      res.status(400).json({ error: "Invalid or missing mint query parameter" });
      return;
    }

    const mint = new PublicKey(mintAddress);
    const walletPk = new PublicKey(wallet);
    const [blacklistPda] = deriveBlacklistPda(mint, walletPk);

    // Check on-chain state
    const { Connection } = require("@solana/web3.js");
    const connection = new Connection(config.solana.rpcUrl, "confirmed");

    const accountInfo = await connection.getAccountInfo(blacklistPda);

    if (!accountInfo) {
      res.json({
        wallet,
        mint: mintAddress,
        blacklisted: false,
        onChainAccount: null,
        message: "No blacklist entry found for this wallet.",
      });
      return;
    }

    // Account exists; parse the blacklisted flag.
    // BlacklistEntry layout: 8 (discriminator) + 32 (mint) + 32 (wallet) + 1 (blacklisted) ...
    const data = accountInfo.data;
    const blacklisted = data.length > 72 ? data[72] === 1 : false;

    res.json({
      wallet,
      mint: mintAddress,
      blacklisted,
      blacklistPda: blacklistPda.toBase58(),
      message: blacklisted
        ? "Wallet is currently blacklisted."
        : "Wallet has a blacklist entry but is not currently blacklisted.",
    });
  } catch (err) {
    log.error("Blacklist check error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// ── GET /api/audit ──────────────────────────────────────────────────────────

router.get("/audit", async (req: Request, res: Response) => {
  try {
    const {
      action,
      actor,
      limit: limitStr,
      offset: offsetStr,
    } = req.query;

    const limit = Math.min(
      Math.max(parseInt(limitStr as string, 10) || 50, 1),
      200
    );
    const offset = Math.max(parseInt(offsetStr as string, 10) || 0, 0);

    const entries = queryAuditTrail({
      action: action as string | undefined,
      actor: actor as string | undefined,
      limit,
      offset,
    });

    // Get total count for pagination
    const db = getDb();
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (action) {
      conditions.push("action = ?");
      values.push(action);
    }
    if (actor) {
      conditions.push("actor = ?");
      values.push(actor);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM audit_trail ${where}`)
      .get(...values) as { total: number };

    res.json({
      entries: entries.map((e) => ({
        ...e,
        details: JSON.parse(e.details),
      })),
      pagination: {
        limit,
        offset,
        total: countRow.total,
        hasMore: offset + limit < countRow.total,
      },
    });
  } catch (err) {
    log.error("Audit trail query error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

export default router;
