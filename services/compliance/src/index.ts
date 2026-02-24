import express from "express";
import { Pool } from "pg";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import { SolanaStablecoin } from "@stbr/sss-token";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3003");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const SSS_MINT = process.env.SSS_MINT!;
const KEYPAIR_PATH = process.env.SSS_KEYPAIR_PATH || "/keys/operator.json";
const CHAINALYSIS_API_KEY = process.env.CHAINALYSIS_API_KEY || "";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const connection = new Connection(RPC_URL, "confirmed");
const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

let stablecoin: SolanaStablecoin;

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", mint: SSS_MINT, mode: "SSS-2" });
  } catch (e: any) {
    res.status(503).json({ status: "error", error: e.message });
  }
});

// ─── Blacklist: Add ───────────────────────────────────────────────────────────

app.post("/blacklist", async (req, res) => {
  const { address, reason } = req.body;

  if (!address || !reason) {
    return res.status(400).json({ error: "address and reason are required" });
  }

  try {
    // Optional: Chainalysis sanctions screening
    if (CHAINALYSIS_API_KEY) {
      const riskScore = await screenAddress(address);
      if (riskScore < 5) {
        return res.status(422).json({
          error: "Address does not meet sanctions threshold for blacklisting",
          riskScore,
        });
      }
    }

    const sig = await stablecoin.compliance.blacklistAdd(
      new PublicKey(address),
      reason
    );

    await db.query(
      `INSERT INTO blacklist_actions (mint, address, action, reason, tx_sig, actor)
       VALUES ($1, $2, 'add', $3, $4, $5)`,
      [SSS_MINT, address, reason, sig, keypair.publicKey.toBase58()]
    );

    await audit("blacklist_add", address, undefined, reason, sig);

    log("info", "Address blacklisted", { address, reason, sig });
    res.json({ success: true, txSig: sig });
  } catch (e: any) {
    log("error", "Blacklist add failed", { address, error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── Blacklist: Remove ────────────────────────────────────────────────────────

app.delete("/blacklist/:address", async (req, res) => {
  const { address } = req.params;
  const { reason } = req.body;

  try {
    const sig = await stablecoin.compliance.blacklistRemove(
      new PublicKey(address),
      reason || "Cleared by compliance"
    );

    await db.query(
      `INSERT INTO blacklist_actions (mint, address, action, reason, tx_sig, actor)
       VALUES ($1, $2, 'remove', $3, $4, $5)`,
      [SSS_MINT, address, reason || "Cleared", sig, keypair.publicKey.toBase58()]
    );

    await audit("blacklist_remove", address, undefined, reason, sig);

    res.json({ success: true, txSig: sig });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Blacklist: Check ─────────────────────────────────────────────────────────

app.get("/blacklist/:address", async (req, res) => {
  const { address } = req.params;
  try {
    const blacklisted = await stablecoin.compliance.isBlacklisted(
      new PublicKey(address)
    );

    // Also fetch history from DB
    const history = await db.query(
      "SELECT * FROM blacklist_actions WHERE address=$1 ORDER BY created_at DESC",
      [address]
    );

    res.json({ address, blacklisted, history: history.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Seize ────────────────────────────────────────────────────────────────────

app.post("/seize", async (req, res) => {
  const { address, treasury } = req.body;

  if (!address || !treasury) {
    return res.status(400).json({ error: "address and treasury are required" });
  }

  try {
    const sig = await stablecoin.compliance.seize(
      new PublicKey(address),
      new PublicKey(treasury)
    );

    await db.query(
      `INSERT INTO seize_actions (mint, from_wallet, to_wallet, amount, tx_sig, seizer)
       VALUES ($1, $2, $3, 0, $4, $5)`,
      [SSS_MINT, address, treasury, sig, keypair.publicKey.toBase58()]
    );

    await audit("seize", address, undefined, `Seized to ${treasury}`, sig);

    log("info", "Tokens seized", { address, treasury, sig });
    res.json({ success: true, txSig: sig });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Audit log export ─────────────────────────────────────────────────────────

app.get("/audit-log", async (req, res) => {
  const { action, limit = "100", offset = "0" } = req.query as Record<string, string>;

  const query = action
    ? await db.query(
        "SELECT * FROM audit_log WHERE mint=$1 AND action=$2 ORDER BY created_at DESC LIMIT $3 OFFSET $4",
        [SSS_MINT, action, limit, offset]
      )
    : await db.query(
        "SELECT * FROM audit_log WHERE mint=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        [SSS_MINT, limit, offset]
      );

  res.json({ entries: query.rows, total: query.rows.length });
});

// ─── Sanctions screening (Chainalysis integration point) ──────────────────────

async function screenAddress(address: string): Promise<number> {
  if (!CHAINALYSIS_API_KEY) return 10; // default: pass if no key configured

  // Integration point — replace with actual Chainalysis API call
  // https://docs.chainalysis.com/api/kyc/
  try {
    const response = await fetch(
      `https://api.chainalysis.com/api/risk/v2/entities/${address}`,
      {
        headers: {
          Token: CHAINALYSIS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    const data = (await response.json()) as any;
    return data.riskScore ?? 10;
  } catch {
    return 10; // fail open if screening unavailable
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function audit(
  action: string,
  target?: string,
  amount?: bigint,
  reason?: string,
  txSig?: string
): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (mint, action, actor, target, amount, reason, tx_sig)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      SSS_MINT,
      action,
      keypair.publicKey.toBase58(),
      target ?? null,
      amount?.toString() ?? null,
      reason ?? null,
      txSig ?? null,
    ]
  );
}

function log(level: string, msg: string, data: Record<string, any> = {}): void {
  console.log(JSON.stringify({
    level, msg, service: "compliance",
    timestamp: new Date().toISOString(), ...data,
  }));
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  stablecoin = await SolanaStablecoin.load(
    connection,
    new PublicKey(SSS_MINT),
    keypair
  );

  app.listen(PORT, () =>
    log("info", `Compliance service started on port ${PORT}`)
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});