import dotenv from "dotenv";
import path from "path";

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export interface AppConfig {
  solana: {
    rpcUrl: string;
    wsUrl: string;
  };
  programs: {
    sssCore: string;
    sssHook: string;
  };
  keypairPath: string;
  server: {
    port: number;
    host: string;
  };
  database: {
    path: string;
  };
  webhook: {
    maxRetries: number;
    retryDelayMs: number;
  };
  logLevel: string;
}

export const config: AppConfig = {
  solana: {
    rpcUrl: optional("SOLANA_RPC_URL", "http://localhost:8899"),
    wsUrl: optional("SOLANA_WS_URL", "ws://localhost:8900"),
  },
  programs: {
    sssCore: optional(
      "SSS_CORE_PROGRAM_ID",
      "CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y"
    ),
    sssHook: optional(
      "SSS_HOOK_PROGRAM_ID",
      "9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM"
    ),
  },
  keypairPath: optional(
    "KEYPAIR_PATH",
    path.join(
      process.env.HOME || "~",
      ".config",
      "solana",
      "id.json"
    )
  ),
  server: {
    port: parseInt(optional("PORT", "3000"), 10),
    host: optional("HOST", "0.0.0.0"),
  },
  database: {
    path: optional("DATABASE_PATH", "./data/sss.db"),
  },
  webhook: {
    maxRetries: parseInt(optional("WEBHOOK_MAX_RETRIES", "3"), 10),
    retryDelayMs: parseInt(optional("WEBHOOK_RETRY_DELAY_MS", "1000"), 10),
  },
  logLevel: optional("LOG_LEVEL", "info"),
};

export function validateConfig(): void {
  if (!config.solana.rpcUrl.startsWith("http")) {
    throw new Error("SOLANA_RPC_URL must be a valid HTTP(S) URL");
  }
  if (!config.solana.wsUrl.startsWith("ws")) {
    throw new Error("SOLANA_WS_URL must be a valid WebSocket URL");
  }
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error("PORT must be between 1 and 65535");
  }
}
