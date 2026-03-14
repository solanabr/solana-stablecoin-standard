const env = import.meta.env;

export const DEVNET_PROGRAM_IDS = {
  stablecoin: '5C7LHvieTag3oioHsni4SgTVDeCYMLTchix5obimXkEL',
  transferHook: 'CHfiQPpbATb9qDbYMA8sRKPxRu3sYHdMW4s4JG4xJt1H',
} as const;

export const DEFAULT_RPC_URL = env.VITE_RPC_URL?.trim() || 'https://api.devnet.solana.com';
export const DEFAULT_ENVIRONMENT =
  (env.VITE_DEFAULT_ENVIRONMENT as 'devnet' | 'mainnet-beta' | 'localnet' | undefined) ?? 'devnet';
