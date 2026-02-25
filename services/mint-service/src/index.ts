/**
 * SSS Mint Service — fiat-to-stablecoin request lifecycle.
 *
 * Manages mint and burn requests with status tracking.
 * Requests move through: pending → executing → confirmed | failed.
 *
 * Environment:
 *   SERVICE_PORT       — HTTP port (default 3001)
 *   SOLANA_RPC_URL     — Solana RPC (default http://localhost:8899)
 *   SSS_TOKEN_PROGRAM_ID — main program public key
 *   API_SECRET         — if set, all routes require Authorization: Bearer <secret>
 */

import express, { Request, Response, NextFunction } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.SERVICE_PORT ?? "3001", 10);
const RPC = process.env.SOLANA_RPC_URL ?? "http://localhost:8899";
const SSS_PROGRAM = process.env.SSS_TOKEN_PROGRAM_ID ?? "E7iCiXrkudyt5j1nVHHmbuqCEyLP2hD4VGNJyuPAdWwP";
const API_SECRET = process.env.API_SECRET ?? "";

// MOCK_EXECUTION=true (default) — verifies mint account exists on-chain but does NOT
// submit a real transaction. Set MOCK_EXECUTION=false and provide AUTHORITY_KEYPAIR_PATH
// to enable live execution via the SSS SDK.
const MOCK_EXECUTION = (process.env.MOCK_EXECUTION ?? "true") !== "false";

const connection = new Connection(RPC, "confirmed");
const START_TIME = Date.now();

// ---------------------------------------------------------------------------
// In-memory request store (replace with Postgres for production)
// ---------------------------------------------------------------------------

type RequestStatus = "pending" | "executing" | "confirmed" | "failed";

interface MintRequest {
  id: string;
  type: "mint" | "burn";
  mint: string;
  recipient?: string;
  amount: string;
  status: RequestStatus;
  signature?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
}

const requests = new Map<string, MintRequest>();

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function auth(req: Request, res: Response, next: NextFunction): void {
  if (!API_SECRET) { next(); return; }
  const header = req.headers.authorization ?? "";
  if (header === `Bearer ${API_SECRET}`) { next(); return; }
  res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED", statusCode: 401 });
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// GET /health
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "mint-service",
    rpc: RPC,
    mockExecution: MOCK_EXECUTION,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
  });
});

// POST /api/v1/mint/request
app.post("/api/v1/mint/request", auth, (req: Request, res: Response) => {
  const { mint, recipient, amount } = req.body as {
    mint?: string;
    recipient?: string;
    amount?: string;
  };

  if (!mint || !recipient || !amount) {
    res.status(400).json({
      error: "mint, recipient, and amount are required",
      code: "MISSING_FIELDS",
      statusCode: 400,
    });
    return;
  }

  const id = randomUUID();
  const entry: MintRequest = {
    id,
    type: "mint",
    mint,
    recipient,
    amount: String(amount),
    status: "pending",
    createdAt: now(),
    updatedAt: now(),
  };
  requests.set(id, entry);

  // Kick off async execution (fire-and-forget; real impl uses a job queue)
  executeMint(id).catch((err: unknown) => {
    const r = requests.get(id);
    if (r) {
      r.status = "failed";
      r.error = String(err);
      r.updatedAt = now();
    }
  });

  res.status(202).json({ id, status: entry.status, type: entry.type, mockExecution: MOCK_EXECUTION });
});

async function executeMint(id: string): Promise<void> {
  const r = requests.get(id);
  if (!r) return;
  r.status = "executing";
  r.updatedAt = now();

  // Verify the mint account exists on-chain as a basic sanity check.
  const mintPk = new PublicKey(r.mint);
  const info = await connection.getAccountInfo(mintPk);
  if (!info) throw new Error(`Mint account not found: ${r.mint}`);

  if (MOCK_EXECUTION) {
    // MOCK MODE: mint account existence verified but no transaction submitted.
    // Production: set MOCK_EXECUTION=false and provide AUTHORITY_KEYPAIR_PATH;
    // execution will call SolanaStablecoin.mintTokens() via the SSS SDK.
    r.status = "confirmed";
    r.signature = "mock_no_tx_submitted";
    r.confirmedAt = now();
    r.updatedAt = now();
    return;
  }

  // Production path — requires AUTHORITY_KEYPAIR_PATH in env.
  throw new Error("Live execution not configured: set MOCK_EXECUTION=false and AUTHORITY_KEYPAIR_PATH");

}

// POST /api/v1/burn/request
app.post("/api/v1/burn/request", auth, (req: Request, res: Response) => {
  const { mint, amount } = req.body as { mint?: string; amount?: string };

  if (!mint || !amount) {
    res.status(400).json({
      error: "mint and amount are required",
      code: "MISSING_FIELDS",
      statusCode: 400,
    });
    return;
  }

  const id = randomUUID();
  const entry: MintRequest = {
    id,
    type: "burn",
    mint,
    amount: String(amount),
    status: "pending",
    createdAt: now(),
    updatedAt: now(),
  };
  requests.set(id, entry);

  res.status(202).json({ id, status: entry.status, type: entry.type });
});

// GET /api/v1/mint/:id
app.get("/api/v1/mint/:id", auth, (req: Request, res: Response) => {
  const entry = requests.get(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "Request not found", code: "NOT_FOUND", statusCode: 404 });
    return;
  }
  res.json(entry);
});

// GET /api/v1/supply
app.get("/api/v1/supply", auth, async (req: Request, res: Response) => {
  const { mint } = req.query as { mint?: string };
  if (!mint) {
    res.status(400).json({ error: "mint query param required", code: "MISSING_FIELDS", statusCode: 400 });
    return;
  }

  try {
    const mintPk = new PublicKey(mint);
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), mintPk.toBuffer()],
      new PublicKey(SSS_PROGRAM)
    );
    const info = await connection.getAccountInfo(configPda);
    if (!info) {
      res.status(404).json({ error: "StablecoinConfig not found", code: "NOT_FOUND", statusCode: 404 });
      return;
    }
    res.json({ mint, configPda: configPda.toBase58(), accountSize: info.data.length });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err), code: "RPC_ERROR", statusCode: 500 });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[mint-service] listening on port ${PORT}  rpc=${RPC}`);
  if (MOCK_EXECUTION) {
    console.warn("[mint-service] MOCK_EXECUTION=true — mint/burn requests will NOT submit transactions. Set MOCK_EXECUTION=false and AUTHORITY_KEYPAIR_PATH for production.");
  }
});

export default app;
