import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

/**
 * Global configuration for a stablecoin deployment.
 * Corresponds to the StablecoinConfig on-chain account.
 */
export interface StablecoinConfig {
  /** The Token-2022 mint address for this stablecoin. */
  mint: PublicKey;
  /** Preset type: 1 = SSS-1 (Minimal), 2 = SSS-2 (Compliant). */
  preset: number;
  /** Master authority. Can update all other roles and perform seize (SSS-2). */
  authority: PublicKey;
  /** Pending authority for two-step ownership transfer. */
  pendingAuthority: PublicKey;
  /** Master minter. Can configure/remove minters and set quotas. */
  masterMinter: PublicKey;
  /** Pauser. Can pause/unpause all operations. */
  pauser: PublicKey;
  /** Blacklister. Can add/remove wallets from blacklist (SSS-2 only). */
  blacklister: PublicKey;
  /** Whether operations are paused. */
  paused: boolean;
  /** Lifetime total tokens minted (for audit trail). */
  totalMinted: BN;
  /** Lifetime total tokens burned (for audit trail). */
  totalBurned: BN;
  /** Bump for this config PDA. */
  bump: number;
  /** Bump for the mint authority PDA. */
  mintAuthorityBump: number;
}

/**
 * Per-minter state tracking quotas and usage.
 * Corresponds to the MinterState on-chain account.
 */
export interface MinterState {
  /** The parent stablecoin config. */
  config: PublicKey;
  /** The minter's wallet address. */
  minter: PublicKey;
  /** Maximum tokens this minter is allowed to mint. */
  quota: BN;
  /** Tokens minted so far (consumed quota). Burning does NOT reduce this. */
  mintedAmount: BN;
  /** Whether this minter is currently active. */
  enabled: boolean;
  /** Bump for this minter PDA. */
  bump: number;
}

/**
 * Configuration for the transfer hook program instance.
 * Corresponds to the HookConfig on-chain account.
 */
export interface HookConfig {
  /** The Token-2022 mint this hook serves. */
  mint: PublicKey;
  /** The core program's StablecoinConfig PDA. */
  stablecoinConfig: PublicKey;
  /** The core program ID. */
  coreProgram: PublicKey;
  /** Bump for this PDA. */
  bump: number;
}

/**
 * Blacklist entry for a single wallet address.
 * Corresponds to the BlacklistEntry on-chain account.
 */
export interface BlacklistEntry {
  /** The stablecoin mint this entry belongs to. */
  mint: PublicKey;
  /** The blacklisted wallet address. */
  wallet: PublicKey;
  /** Whether this wallet is currently blacklisted. */
  blacklisted: boolean;
  /** Human-readable reason for blacklisting. */
  reason: string;
  /** Unix timestamp when blacklisted. */
  blacklistedAt: BN;
  /** Who initiated the blacklisting. */
  blacklistedBy: PublicKey;
  /** Bump for this PDA. */
  bump: number;
}

/**
 * Parameters for initializing a new stablecoin.
 */
export interface InitializeParams {
  /** Preset: 1 = SSS-1 (Minimal), 2 = SSS-2 (Compliant). */
  preset: number;
  /** Human-readable name of the stablecoin (e.g., "USD Coin"). */
  name: string;
  /** Ticker symbol (e.g., "USDC"). */
  symbol: string;
  /** URI to off-chain metadata JSON. */
  uri: string;
  /** Number of decimal places (0–9). */
  decimals: number;
}

/**
 * Role type enum matching the on-chain roleType enum.
 */
export enum RoleType {
  MasterMinter = "MasterMinter",
  Pauser = "Pauser",
  Blacklister = "Blacklister",
}

/**
 * Result returned by initialize().
 */
export interface InitializeResult {
  /** The newly created mint public key. */
  mint: PublicKey;
  /** The stablecoin config PDA. */
  config: PublicKey;
  /** The transaction signature. */
  txSig: string;
}
