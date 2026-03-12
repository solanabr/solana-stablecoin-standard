import "dotenv/config";
import cors from "cors";
import express, { Express, RequestHandler } from "express";
import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

import { SSSClient } from "../../sdk/src";
import { errorHandler } from "./middleware/error";
import { createRateLimitMiddleware } from "./middleware/rate-limit";
import { createRoutes } from "./routes";

const PORT = parseInt(process.env.PORT || "3001", 10);
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8899";
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || "~/.config/solana/id.json";

function resolvePath(filePath: string): string {
  if (filePath.startsWith("~")) {
    return path.join(process.env.HOME || "/root", filePath.slice(1));
  }

  return path.resolve(filePath);
}

function loadKeypair(keypairPath: string): Keypair {
  const resolvedPath = resolvePath(keypairPath);
  const rawKeypair = fs.readFileSync(resolvedPath, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(rawKeypair));
  return Keypair.fromSecretKey(secretKey);
}

interface CreateAppOptions {
  authority: string;
  rpcUrl?: string;
  postRateLimiter?: RequestHandler;
}

export function createApp(client: SSSClient, options: CreateAppOptions): Express {
  const app = express();
  const rpcUrl = options.rpcUrl ?? RPC_URL;
  const postRateLimiter = options.postRateLimiter ?? createRateLimitMiddleware();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      rpcUrl,
      authority: options.authority,
      uptime: process.uptime(),
    });
  });

  app.use((req, res, next) => {
    if (req.method !== "POST") {
      next();
      return;
    }

    postRateLimiter(req, res, next);
  });

  app.use(createRoutes(client));
  app.use(errorHandler);

  return app;
}

export function startServer(): void {
  if (!process.env.API_KEY) {
    console.error("FATAL: API_KEY environment variable is required but not set.");
    process.exit(1);
  }

  const keypair = loadKeypair(KEYPAIR_PATH);
  console.log(`Authority: ${keypair.publicKey.toBase58()}`);

  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(keypair);
  const client = new SSSClient(connection, wallet);
  const app = createApp(client, {
    authority: keypair.publicKey.toBase58(),
    rpcUrl: RPC_URL,
  });

  app.listen(PORT, () => {
    console.log(`SSS Backend listening on http://localhost:${PORT}`);
    console.log(`RPC: ${RPC_URL}`);
  });
}

if (require.main === module) {
  startServer();
}
