import "dotenv/config";
import express from "express";
import cors from "cors";
import { Connection, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

import { SSSClient } from "../../sdk/src";
import { createRoutes } from "./routes";
import { errorHandler } from "./middleware/error";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "3001", 10);
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8899";
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || "~/.config/solana/id.json";

/**
 * Resolves a file path that may contain ~ for the home directory.
 */
function resolvePath(filePath: string): string {
  if (filePath.startsWith("~")) {
    return path.join(process.env.HOME || "/root", filePath.slice(1));
  }
  return path.resolve(filePath);
}

/**
 * Loads a Solana keypair from a JSON file.
 */
function loadKeypair(keypairPath: string): Keypair {
  const resolved = resolvePath(keypairPath);
  const raw = fs.readFileSync(resolved, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function main(): void {
  // Load authority keypair
  const keypair = loadKeypair(KEYPAIR_PATH);
  console.log(`Authority: ${keypair.publicKey.toBase58()}`);

  // Create Solana connection and SSSClient
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(keypair);
  const client = new SSSClient(connection, wallet);

  // Express application
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      rpcUrl: RPC_URL,
      authority: keypair.publicKey.toBase58(),
      uptime: process.uptime(),
    });
  });

  // API routes
  app.use(createRoutes(client));

  // Error handler (must be registered after routes)
  app.use(errorHandler);

  // Start server
  app.listen(PORT, () => {
    console.log(`SSS Backend listening on http://localhost:${PORT}`);
    console.log(`RPC: ${RPC_URL}`);
  });
}

main();
