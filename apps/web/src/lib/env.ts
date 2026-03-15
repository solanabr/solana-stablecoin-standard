const configuredApiUrl =
  process.env.NEXT_PUBLIC_SSS_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8080";

const rpcUrl =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  "https://api.devnet.solana.com";

export const env = {
  apiUrl: configuredApiUrl,
  apiBasePath: configuredApiUrl,
  apiLabel: configuredApiUrl,
  solanaCluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet",
  rpcUrl,
};
