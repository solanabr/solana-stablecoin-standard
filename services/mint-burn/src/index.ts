import express from "express";
import { Pool } from "pg";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import { SolanaStablecoin } from "@stbr/sss-token";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3001");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const SSS_MINT = process.env.SSS_MINT!;
const KEYPAIR_PATH = process.env.SSS_KEYPAIR_PATH || "/keys/operator.json";
const API_KEY = process.env.API_KEY || "";

// // ─── Database ─────────────────────────────────────────────────────────────────

// const db = new Pool({ connectionString: process.env.DATABASE_URL });

// // ─── Solana connection ────────────────────────────────────────────────────────

// const connection = new Connection(RPC_URL, "confirmed");
// const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
// const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

// let stablecoin: SolanaStablecoin;

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!API_KEY) return next(); // Auth disabled if no API_KEY configured
  const token = req.headers["x-api-key"] || req.headers.authorization?.replace("Bearer ", "");
  if (token !== API_KEY) {
    res.status(401).json({ error: "Unauthorized — invalid or missing API key" });
    return;
  }
  next();
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function isValidPublicKey(str: string): boolean {
  try {
    new PublicKey(str);
    return true;
  } catch {
    return false;
  }
}

function isValidAmount(amount: any): boolean {
  if (amount === undefined || amount === null) return false;
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER;
}

// ─── Database ─────────────────────────────────────────────────────────────────

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Solana connection ────────────────────────────────────────────────────────

const connection = new Connection(RPC_URL, "confirmed");
const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

let stablecoin: SolanaStablecoin;

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    const slot = await connection.getSlot();
    res.json({ status: "ok", slot, mint: SSS_MINT });
  } catch (e: any) {
    res.status(503).json({ status: "error", error: e.message });
  }
});

// ─── Mint request ─────────────────────────────────────────────────────────────

app.post("/mint", requireAuth, async (req, res) => {
  const { recipient, amount, reference } = req.body;

  if (!recipient || !amount) {
    return res.status(400).json({ error: "recipient and amount are required" });
  }
  if (!isValidPublicKey(recipient)) {
    return res.status(400).json({ error: "Invalid recipient address" });
  }
  if (!isValidAmount(amount)) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }

  const result = await db.query(
    `INSERT INTO mint_requests (mint, recipient, amount, status)
     VALUES ($1, $2, $3, 'pending') RETURNING id`,
    [SSS_MINT, recipient, amount]
  );

  const requestId = result.rows[0].id;

  // Execute async
  executeMint(requestId, recipient, BigInt(amount)).catch(console.error);

  res.json({
    requestId,
    status: "pending",
    message: "Mint request accepted",
  });
});

async function executeMint(
  requestId: string,
  recipient: string,
  amount: bigint
): Promise<void> {
  try {
    // Verify step: validate on-chain state before execution
    const state = await stablecoin.getState();
    if (state.paused) {
      throw new Error("Protocol is paused — mint rejected");
    }

    await db.query(
      "UPDATE mint_requests SET status='verified', updated_at=NOW() WHERE id=$1",
      [requestId]
    );
    log("info", "Mint request verified", { requestId, recipient });

    const sig = await stablecoin.mintTokens({
      recipient: new PublicKey(recipient),
      amount,
      minter: keypair,
    });

    await db.query(
      "UPDATE mint_requests SET status='executed', tx_sig=$1, updated_at=NOW() WHERE id=$2",
      [sig, requestId]
    );

    // Emit to audit log
    await db.query(
      `INSERT INTO audit_log (mint, action, actor, target, amount, tx_sig)
       VALUES ($1, 'mint', $2, $3, $4, $5)`,
      [SSS_MINT, keypair.publicKey.toBase58(), recipient, amount.toString(), sig]
    );

    log("info", "Mint executed", { requestId, recipient, amount: amount.toString(), sig });
  } catch (e: any) {
    await db.query(
      "UPDATE mint_requests SET status='failed', error=$1, updated_at=NOW() WHERE id=$2",
      [e.message, requestId]
    );
    log("error", "Mint failed", { requestId, error: e.message });
  }
}

// ─── Burn request ─────────────────────────────────────────────────────────────

app.post("/burn", requireAuth, async (req, res) => {
  const { from, amount } = req.body;

  if (!from || !amount) {
    return res.status(400).json({ error: "from and amount are required" });
  }
  if (!isValidPublicKey(from)) {
    return res.status(400).json({ error: "Invalid source address" });
  }
  if (!isValidAmount(amount)) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }

  const result = await db.query(
    `INSERT INTO burn_requests (mint, from_wallet, amount, status)
     VALUES ($1, $2, $3, 'pending') RETURNING id`,
    [SSS_MINT, from, amount]
  );

  const requestId = result.rows[0].id;
  executeBurn(requestId, from, BigInt(amount)).catch(console.error);

  res.json({ requestId, status: "pending" });
});

async function executeBurn(
  requestId: string,
  from: string,
  amount: bigint
): Promise<void> {
  try {
    const sig = await stablecoin.burn(new PublicKey(from), amount);

    await db.query(
      "UPDATE burn_requests SET status='executed', tx_sig=$1, updated_at=NOW() WHERE id=$2",
      [sig, requestId]
    );

    await db.query(
      `INSERT INTO audit_log (mint, action, actor, target, amount, tx_sig)
       VALUES ($1, 'burn', $2, $3, $4, $5)`,
      [SSS_MINT, keypair.publicKey.toBase58(), from, amount.toString(), sig]
    );

    log("info", "Burn executed", { requestId, from, amount: amount.toString(), sig });
  } catch (e: any) {
    await db.query(
      "UPDATE burn_requests SET status='failed', error=$1, updated_at=NOW() WHERE id=$2",
      [e.message, requestId]
    );
    log("error", "Burn failed", { requestId, error: e.message });
  }
}

// ─── Request status ───────────────────────────────────────────────────────────

app.get("/mint/:id", async (req, res) => {
  const result = await db.query(
    "SELECT * FROM mint_requests WHERE id=$1",
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Not found" });
  res.json(result.rows[0]);
});

app.get("/burn/:id", async (req, res) => {
  const result = await db.query(
    "SELECT * FROM burn_requests WHERE id=$1",
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Not found" });
  res.json(result.rows[0]);
});

// ─── Structured logging ───────────────────────────────────────────────────────

function log(level: string, msg: string, data: Record<string, any> = {}): void {
  console.log(JSON.stringify({
    level,
    msg,
    service: "mint-burn",
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

let server: any;

async function main(): Promise<void> {
  stablecoin = await SolanaStablecoin.load(
    connection,
    new PublicKey(SSS_MINT),
    keypair
  );

  server = app.listen(PORT, () => {
    log("info", `Mint-burn service started on port ${PORT}`, {
      mint: SSS_MINT,
      cluster: RPC_URL,
    });
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  log("info", `Received ${signal}, shutting down gracefully...`);
  if (server) {
    server.close(() => {
      db.end().then(() => {
        log("info", "Shutdown complete");
        process.exit(0);
      });
    });
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});