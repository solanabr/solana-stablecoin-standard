import { PublicKey } from "@solana/web3.js";

// ── On-chain Account Types ─────────────────────────────────────────────

/** Mirrors the on-chain StablecoinConfig account */
export interface StablecoinConfig {
  authority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  isPaused: boolean;
  totalMinted: bigint;
  totalBurned: bigint;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  enableConfidentialTransfers: boolean;
  defaultAccountFrozen: boolean;
  bump: number;
}

/** Mirrors the on-chain RoleManager account */
export interface RoleManager {
  config: PublicKey;
  masterAuthority: PublicKey;
  pauser: PublicKey;
  minters: MinterEntry[];
  burners: PublicKey[];
  blacklister: PublicKey;
  seizer: PublicKey;
  bump: number;
}

/** A minter with quota tracking */
export interface MinterEntry {
  address: PublicKey;
  quota: bigint;
  minted: bigint;
}

/** Mirrors the on-chain BlacklistEntry account */
export interface BlacklistEntry {
  config: PublicKey;
  address: PublicKey;
  reason: string;
  blacklistedAt: bigint;
  blacklistedBy: PublicKey;
  bump: number;
}

// ── SDK Operation Types ────────────────────────────────────────────────

/** Parameters for creating a new stablecoin */
export interface CreateParams {
  /** Use a preset configuration (SSS-1, SSS-2, SSS-3) */
  preset?: "SSS_1" | "SSS_2" | "SSS_3";
  /** Stablecoin name (max 32 chars) */
  name: string;
  /** Ticker symbol (max 10 chars) */
  symbol: string;
  /** Number of decimals (typically 6) */
  decimals: number;
  /** Metadata URI */
  uri?: string;
  /** Master authority keypair */
  authority: import("@solana/web3.js").Keypair;
  /** Custom extension configuration (overrides preset) */
  extensions?: ExtensionConfig;
  /** Initial role assignments */
  roles?: InitialRoles;
}

/** Token-2022 extension configuration */
export interface ExtensionConfig {
  permanentDelegate?: boolean;
  transferHook?: boolean;
  defaultAccountFrozen?: boolean;
  confidentialTransfers?: boolean;
}

/** Initial role assignments */
export interface InitialRoles {
  pauser?: PublicKey;
  blacklister?: PublicKey;
  seizer?: PublicKey;
}

/** Parameters for minting tokens */
export interface MintParams {
  /** Recipient's public key */
  recipient: PublicKey;
  /** Amount to mint (in base units) */
  amount: bigint;
  /** Minter keypair (must be authorized) */
  minter: import("@solana/web3.js").Keypair;
}

/** Parameters for burning tokens */
export interface BurnParams {
  /** Amount to burn (in base units) */
  amount: bigint;
  /** Burner keypair (must be authorized) */
  burner: import("@solana/web3.js").Keypair;
}

/** Compliance module interface for SSS-2 operations */
export interface ComplianceModule {
  /** Add an address to the blacklist */
  blacklistAdd(address: PublicKey, reason: string): Promise<string>;
  /** Remove an address from the blacklist */
  blacklistRemove(address: PublicKey): Promise<string>;
  /** Seize tokens from a frozen, blacklisted account */
  seize(from: PublicKey, treasury: PublicKey): Promise<string>;
  /** Check if an address is blacklisted */
  isBlacklisted(address: PublicKey): Promise<boolean>;
}
