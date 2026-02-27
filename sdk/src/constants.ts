import { PublicKey } from "@solana/web3.js";

export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4"
);

export const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy"
);

export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

export const SEEDS = {
  CONFIG: Buffer.from("config"),
  ROLES: Buffer.from("roles"),
  MINTER: Buffer.from("minter"),
  BLACKLIST: Buffer.from("blacklist"),
  RESERVE: Buffer.from("reserve"),
  AUDIT: Buffer.from("audit"),
  EXTRA_ACCOUNT_METAS: Buffer.from("extra-account-metas"),
} as const;
