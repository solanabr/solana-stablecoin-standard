export interface BackendConfig {
  port: number;
  solana: {
    rpcUrl: string;
    wsUrl: string;
    commitment: "confirmed" | "finalized";
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
  };
  webhooks: {
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
  };
  compliance: {
    maxBlacklistSize: number;
    alertThresholdAmount: bigint;
  };
}

export const defaultConfig: BackendConfig = {
  port: parseInt(process.env.SSS_PORT ?? "4000"),
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    wsUrl: process.env.SOLANA_WS_URL ?? "wss://api.devnet.solana.com",
    commitment: "confirmed",
  },
  database: {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432"),
    name: process.env.DB_NAME ?? "sss_indexer",
    user: process.env.DB_USER ?? "sss",
    password: process.env.DB_PASSWORD ?? "",
  },
  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379"),
  },
  webhooks: {
    maxRetries: 3,
    retryDelayMs: 5000,
    timeoutMs: 10000,
  },
  compliance: {
    maxBlacklistSize: 256,
    alertThresholdAmount: BigInt(process.env.ALERT_THRESHOLD ?? "1000000000"),
  },
};
