import express from "express";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import pino from "pino";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: "../config/.env" });

const log = pino({
  level: process.env.LOG_LEVEL || "info",
  name: "sss-mint-burn",
});

const PORT = parseInt(process.env.PORT || "3001");
const app = express();
app.use(express.json());

// ─── State ───────────────────────────────────────────────────────

interface MintBurnRequest {
  id: string;
  type: "mint" | "burn";
  amount: string;
  destination?: string;
  source?: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  signature?: string;
  error?: string;
  createdAt: string;
}

const requestQueue: MintBurnRequest[] = [];
let connection: Connection;
let provider: AnchorProvider;

// ─── Initialize ──────────────────────────────────────────────────

function initConnection() {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  connection = new Connection(rpcUrl, "confirmed");

  const keypairPath = process.env.OPERATOR_KEYPAIR_PATH;
  if (keypairPath && fs.existsSync(keypairPath)) {
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
    const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    const wallet = new Wallet(keypair);
    provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    log.info({ wallet: keypair.publicKey.toBase58() }, "Operator wallet loaded");
  } else {
    log.warn("No operator keypair configured - running in read-only mode");
  }

  log.info({ rpc: rpcUrl }, "Connection initialized");
}

// ─── Routes ──────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "mint-burn",
    uptime: process.uptime(),
    queueLength: requestQueue.filter((r) => r.status === "pending").length,
  });
});

app.post("/api/mint", async (req, res) => {
  const { amount, destination, mint } = req.body;

  if (!amount || !destination || !mint) {
    return res.status(400).json({ error: "Missing required fields: amount, destination, mint" });
  }

  const request: MintBurnRequest = {
    id: `mint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "mint",
    amount,
    destination,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  requestQueue.push(request);
  log.info({ requestId: request.id, amount, destination }, "Mint request queued");

  // Process asynchronously
  processMintBurn(request, mint).catch((err) => {
    log.error({ requestId: request.id, err: err.message }, "Mint failed");
    request.status = "failed";
    request.error = err.message;
  });

  res.status(202).json({ requestId: request.id, status: "pending" });
});

app.post("/api/burn", async (req, res) => {
  const { amount, source, mint } = req.body;

  if (!amount || !source || !mint) {
    return res.status(400).json({ error: "Missing required fields: amount, source, mint" });
  }

  const request: MintBurnRequest = {
    id: `burn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "burn",
    amount,
    source,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  requestQueue.push(request);
  log.info({ requestId: request.id, amount, source }, "Burn request queued");

  processMintBurn(request, mint).catch((err) => {
    log.error({ requestId: request.id, err: err.message }, "Burn failed");
    request.status = "failed";
    request.error = err.message;
  });

  res.status(202).json({ requestId: request.id, status: "pending" });
});

app.get("/api/status/:id", (req, res) => {
  const request = requestQueue.find((r) => r.id === req.params.id);
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }
  res.json(request);
});

app.get("/api/history", (_req, res) => {
  res.json(requestQueue.slice(-100)); // Last 100 requests
});

// ─── Processing ──────────────────────────────────────────────────

async function processMintBurn(request: MintBurnRequest, mint: string) {
  if (!provider) {
    throw new Error("No operator keypair configured");
  }

  request.status = "submitted";
  log.info({ requestId: request.id, type: request.type }, "Processing request");

  const mintPubkey = new PublicKey(mint);
  const amount = BigInt(request.amount);

  if (amount <= 0n) {
    throw new Error("Amount must be positive");
  }

  try {
    // Dynamic import to allow building without SDK installed locally
    const { SolanaStablecoin } = await import("@solana-stablecoin/sdk");
    const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);

    if (request.type === "mint") {
      if (!request.destination) throw new Error("Destination required for mint");
      request.signature = await stablecoin.mint(
        new PublicKey(request.destination),
        amount
      );
    } else {
      if (!request.source) throw new Error("Source required for burn");
      request.signature = await stablecoin.burn(
        new PublicKey(request.source),
        amount
      );
    }

    request.status = "confirmed";
    log.info(
      { requestId: request.id, signature: request.signature },
      `${request.type} completed`
    );
  } catch (err: any) {
    request.status = "failed";
    request.error = err.message;
    log.error(
      { requestId: request.id, err: err.message },
      `${request.type} failed`
    );
    throw err;
  }
}

// ─── Start ───────────────────────────────────────────────────────

initConnection();
app.listen(PORT, () => {
  log.info({ port: PORT }, "Mint-burn service started");
});

export default app;
