/**
 * Configuration loaded from environment variables.
 * @module config
 */

export interface Config {
  /** Server port */
  port: number;
  /** Server host */
  host: string;
  /** Log level */
  logLevel: string;
  /** Node environment */
  nodeEnv: string;
  /** Solana RPC URL */
  rpcUrl: string;
  /** Stablecoin mint address */
  mintAddress: string;
  /** Authority keypair path (for write operations) */
  keypairPath: string;
  /** Webhook URL for event notifications */
  webhookUrl: string | null;
  /** Webhook secret for signing payloads */
  webhookSecret: string | null;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "0.0.0.0",
    logLevel: process.env.LOG_LEVEL || "info",
    nodeEnv: process.env.NODE_ENV || "production",
    rpcUrl: process.env.RPC_URL || "https://api.devnet.solana.com",
    mintAddress: process.env.MINT_ADDRESS || "",
    keypairPath: process.env.KEYPAIR_PATH || "",
    webhookUrl: process.env.WEBHOOK_URL || null,
    webhookSecret: process.env.WEBHOOK_SECRET || null,
  };
}
