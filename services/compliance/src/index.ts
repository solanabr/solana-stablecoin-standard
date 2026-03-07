import express from "express";
import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3002", 10);
const RPC_URL = process.env.RPC_URL ?? "http://localhost:8899";
const MINT_PUBKEY = process.env.MINT ?? "";
const DB_PATH = process.env.DB_PATH ?? "./data/compliance.db";
const AUTHORITY_KEYPAIR_PATH =
  process.env.AUTHORITY_KEYPAIR_PATH ?? "/secrets/authority.json";

app.use(express.json());

// Initialize SQLite database
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_trail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    address TEXT NOT NULL,
    reason TEXT,
    operator TEXT NOT NULL,
    signature TEXT,
    timestamp TEXT NOT NULL
  );
`);

function loadKeypair(): Keypair {
  const secret = JSON.parse(
    fs.readFileSync(AUTHORITY_KEYPAIR_PATH, "utf8")
  ) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sss-compliance" });
});

/**
 * POST /blacklist/add
 * Body: { address: string, reason: string }
 */
app.post("/blacklist/add", async (req, res) => {
  const { address, reason } = req.body as { address: string; reason: string };
  if (!address || !reason) {
    return res.status(400).json({ error: "address and reason required" });
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const authority = loadKeypair();
    const mint = new PublicKey(MINT_PUBKEY);

    const stable = await SolanaStablecoin.load(connection, mint, authority);
    const sig = await stable.compliance.blacklistAdd(
      new PublicKey(address),
      reason,
      authority
    );

    db.prepare(
      "INSERT INTO audit_trail (action, address, reason, operator, signature, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("blacklist_add", address, reason, authority.publicKey.toBase58(), sig, new Date().toISOString());

    return res.json({ signature: sig, status: "blacklisted" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /blacklist/remove
 * Body: { address: string }
 */
app.post("/blacklist/remove", async (req, res) => {
  const { address } = req.body as { address: string };
  if (!address) {
    return res.status(400).json({ error: "address required" });
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const authority = loadKeypair();
    const mint = new PublicKey(MINT_PUBKEY);

    const stable = await SolanaStablecoin.load(connection, mint, authority);
    const sig = await stable.compliance.blacklistRemove(
      new PublicKey(address),
      authority
    );

    db.prepare(
      "INSERT INTO audit_trail (action, address, reason, operator, signature, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("blacklist_remove", address, null, authority.publicKey.toBase58(), sig, new Date().toISOString());

    return res.json({ signature: sig, status: "removed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /blacklist
 * Returns all blacklisted addresses from on-chain state
 */
app.get("/blacklist", async (_req, res) => {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const authority = loadKeypair();
    const mint = new PublicKey(MINT_PUBKEY);

    const stable = await SolanaStablecoin.load(connection, mint, authority);
    const entries = await stable.compliance.listBlacklisted();

    return res.json(
      entries.map((e) => ({
        address: e.address.toBase58(),
        reason: e.reason,
        blacklister: e.blacklister.toBase58(),
        timestamp: new Date(Number(e.timestamp) * 1000).toISOString(),
      }))
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /audit-log
 * Returns the local audit trail
 */
app.get("/audit-log", (req, res) => {
  const { action, limit = "100" } = req.query as {
    action?: string;
    limit?: string;
  };

  const rows = action
    ? db
        .prepare(
          "SELECT * FROM audit_trail WHERE action = ? ORDER BY id DESC LIMIT ?"
        )
        .all(action, parseInt(limit, 10))
    : db
        .prepare("SELECT * FROM audit_trail ORDER BY id DESC LIMIT ?")
        .all(parseInt(limit, 10));

  return res.json(rows);
});

app.listen(PORT, () => {
  console.log(`SSS Compliance service listening on port ${PORT}`);
});
