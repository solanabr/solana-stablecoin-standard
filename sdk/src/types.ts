import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

/** Preset variants matching the on-chain Preset enum */
export enum StablecoinPreset {
  /** SSS-1: Minimal — mint authority + freeze authority + metadata */
  SSS1 = 0,
  /** SSS-2: Compliant — SSS-1 + permanent delegate + transfer hook + blacklist */
  SSS2 = 1,
  /** SSS-3: Private — SSS-2 + confidential transfers */
  SSS3 = 2,
  /** Custom configuration */
  Custom = 3,
}

/** On-chain StablecoinConfig account */
export interface StablecoinConfig {
  mint: PublicKey;
  preset: StablecoinPreset;
  paused: boolean;
  maxSupply: BN;
  decimals: number;
  permanentDelegateEnabled: boolean;
  transferHookEnabled: boolean;
  confidentialTransfersEnabled: boolean;
  oracleEnabled: boolean;
  bump: number;
}

/** On-chain RolesConfig account */
export interface RolesConfig {
  mint: PublicKey;
  masterAuthority: PublicKey;
  minter: PublicKey;
  minterQuota: BN;
  mintedThisEpoch: BN;
  burner: PublicKey;
  blacklister: PublicKey;
  pauser: PublicKey;
  seizer: PublicKey;
  bump: number;
}

/** On-chain BlacklistEntry account (SSS-2 only) */
export interface BlacklistEntry {
  mint: PublicKey;
  address: PublicKey;
  addedAt: BN;
  addedBy: PublicKey;
  reason: number;
  bump: number;
}

/** Parameters for initializing a new stablecoin */
export interface InitializeParams {
  /** Token name (max 32 chars) */
  name: string;
  /** Token symbol (max 10 chars) */
  symbol: string;
  /** Metadata URI (max 200 chars) */
  uri: string;
  /** Decimal places (0-9) */
  decimals?: number;
  /** Maximum supply in base units (0 = unlimited) */
  maxSupply?: BN;
  /** Preset: SSS1 or SSS2 */
  preset: StablecoinPreset;
  /** Initial minter (defaults to authority if not provided) */
  minter?: PublicKey;
  /** Optional per-minter quota in base units (0 = unlimited) */
  minterQuota?: BN;
  /** Optional burner (defaults to authority) */
  burner?: PublicKey;
  /** Optional blacklister (SSS-2 only, defaults to authority) */
  blacklister?: PublicKey;
  /** Optional pauser (defaults to authority) */
  pauser?: PublicKey;
  /** Optional seizer (SSS-2 only, defaults to authority) */
  seizer?: PublicKey;
}

/** Parameters for updating roles */
export interface UpdateRolesParams {
  newMinter?: PublicKey;
  newBurner?: PublicKey;
  newBlacklister?: PublicKey;
  newPauser?: PublicKey;
  newSeizer?: PublicKey;
  newMinterQuota?: BN;
}

/** Result of a stablecoin initialization */
export interface InitializeResult {
  mint: PublicKey;
  stablecoinConfig: PublicKey;
  rolesConfig: PublicKey;
  signature: string;
}

/** On-chain OracleConfig account */
export interface OracleConfig {
  mint: PublicKey;
  priceFeed: PublicKey;
  pegCurrency: number[];
  maxStalenessSecs: BN;
  priceExponent: number;
  enabled: boolean;
  configuredBy: PublicKey;
  configuredAt: BN;
  bump: number;
}

/** Parameters for configuring an oracle price feed */
export interface ConfigureOracleParams {
  /** The oracle price feed account (e.g. Pyth price account) */
  priceFeed: PublicKey;
  /** Peg currency code (e.g. "EUR", "XAU", "BRL") — max 8 chars */
  pegCurrency: string;
  /** Maximum staleness in seconds before price data is rejected */
  maxStalenessSecs: number;
  /** Price exponent (e.g. -8 for Pyth) */
  priceExponent: number;
}
