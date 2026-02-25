import type { Keypair, PublicKey } from "@solana/web3.js";

/**
 * Configuration passed to SolanaStablecoin.create()
 */
export interface CreateConfig {
  /** Human-readable token name (max 32 chars) */
  name: string;
  /** Token symbol (max 10 chars) */
  symbol: string;
  /** Number of decimal places. Defaults to 6. */
  decimals?: number;
  /** Metadata URI. Defaults to "". */
  uri?: string;
  /** Preset to apply. Defaults to "sss-1" (minimal). */
  preset?: "sss-1" | "sss-2";
  /**
   * Override the transfer hook program ID.
   * Only relevant when preset is "sss-2" or enableTransferHook is explicitly set.
   * Defaults to the canonical HOOK_PROGRAM_ID for SSS-2.
   */
  transferHookProgramId?: PublicKey;
}

/**
 * On-chain data for a stablecoin, returned by SolanaStablecoin.getInfo()
 */
export interface StablecoinInfo {
  mint: PublicKey;
  config: PublicKey;
  authority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  paused: boolean;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  enableDefaultFrozen: boolean;
  totalMinted: bigint;
  totalBurned: bigint;
}

export interface MintParams {
  recipient: PublicKey;
  amount: bigint;
  minter: Keypair;
}

export interface BurnParams {
  amount: bigint;
  burner: Keypair;
}

/**
 * Minter info returned by getMinters()
 */
export interface MinterInfoEntry {
  address: PublicKey;
  quota: bigint;
  minted: bigint;
}
