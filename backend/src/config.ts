export interface ServiceConfig {
  rpcUrl: string;
  port: number;
  host: string;
  service: string;
  apiKey: string;
  bodyLimitBytes: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  storePath: string;
  stablecoinMint?: string;
  stablecoinProgramId?: string;
  authorityKeypairPath?: string;
  sanctionsScreeningUrl?: string;
  sanctionsScreeningApiKey?: string;
}

export function getServiceConfig(service: string, fallbackPort: number): ServiceConfig {
  return {
    rpcUrl: process.env.RPC_URL ?? "https://api.devnet.solana.com",
    port: Number(process.env.PORT ?? fallbackPort),
    host: process.env.HOST ?? "127.0.0.1",
    service,
    apiKey: process.env.SERVICE_API_KEY ?? "",
    bodyLimitBytes: Number(process.env.BODY_LIMIT_BYTES ?? 65_536),
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 120),
    storePath: process.env.STORE_PATH ?? "data/store.json",
    stablecoinMint: process.env.SSS_MINT,
    stablecoinProgramId: process.env.SSS_STABLECOIN_PROGRAM_ID,
    authorityKeypairPath: process.env.SSS_KEYPAIR,
    sanctionsScreeningUrl: process.env.SANCTIONS_SCREENING_URL,
    sanctionsScreeningApiKey: process.env.SANCTIONS_SCREENING_API_KEY
  };
}
