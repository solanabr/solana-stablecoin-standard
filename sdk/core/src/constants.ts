import { PublicKey } from "@solana/web3.js";

export const SSS_CORE_PROGRAM_ID = new PublicKey(
  "SSSXsBqANHdRRPBEiNUjGjgARJmQR1tQHNBqJBMvFUw"
);

export const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "SSSHooKvTgEyqsX1mEBHXrLHyWzGGY9V8tECJpJPZyp"
);

export const STABLECOIN_SEED = Buffer.from("stablecoin");
export const MINTER_RECORD_SEED = Buffer.from("minter_record");
export const BLACKLIST_SEED = Buffer.from("blacklist");
export const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");

// Default decimals for stablecoins (USDC standard)
export const DEFAULT_DECIMALS = 6;
