import { PublicKey, Keypair } from "@solana/web3.js";

// ═══════════════════════════════════════════════════════════════════════
// On-chain Account Types
// These mirror the Anchor account structs in the Rust program.
// ═══════════════════════════════════════════════════════════════════════

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
  supplyCap: bigint | null;
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

// ═══════════════════════════════════════════════════════════════════════
// SDK Operation Parameters
// ═══════════════════════════════════════════════════════════════════════

/** Parameters for creating a new stablecoin */
export interface CreateParams {
  /** Use a preset configuration (SSS_1, SSS_2, SSS_3) */
  preset?: "SSS_1" | "SSS_2" | "SSS_3";
  /** Stablecoin name (max 32 chars) */
  name: string;
  /** Ticker symbol (max 10 chars) */
  symbol: string;
  /** Number of decimals (typically 6) */
  decimals: number;
  /** Metadata URI */
  uri?: string;
  /** Custom extension configuration (overrides preset) */
  extensions?: ExtensionConfig;
  /** Initial role assignments */
  roles?: InitialRoles;
  /** Optional: provide your own mint keypair (for deterministic testing) */
  mintKeypair?: Keypair;
  /** Optional hard supply cap — total mintable tokens. Prevents over-minting. */
  supplyCap?: bigint;
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
  /** Amount to mint (in base units, e.g. 1_000_000 for 1 token at 6 decimals) */
  amount: bigint;
  /** Optional: minter keypair (defaults to wallet signer) */
  minter?: Keypair;
}

/** Parameters for burning tokens */
export interface BurnParams {
  /** Amount to burn (in base units) */
  amount: bigint;
  /** Optional: burner keypair (defaults to wallet signer) */
  burner?: Keypair;
}

/** Parameters for freezing a token account */
export interface FreezeParams {
  /** The wallet address whose token account to freeze */
  address: PublicKey;
}

/** Parameters for thawing a token account */
export interface ThawParams {
  /** The wallet address whose token account to thaw */
  address: PublicKey;
}

/** Parameters for updating a minter */
export interface UpdateMinterParams {
  /** Minter's public key */
  minter: PublicKey;
  /** Maximum amount this minter can mint */
  quota: bigint;
}

/** Parameters for updating roles */
export interface UpdateRolesParams {
  newPauser?: PublicKey;
  newBlacklister?: PublicKey;
  newSeizer?: PublicKey;
  addBurner?: PublicKey;
  removeBurner?: PublicKey;
}

/** Parameters for adding to blacklist */
export interface BlacklistAddParams {
  /** Address to blacklist */
  address: PublicKey;
  /** Reason for blacklisting (max 128 chars) */
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Module Interfaces
// ═══════════════════════════════════════════════════════════════════════

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
  /** Fetch the full blacklist entry */
  getBlacklistEntry(address: PublicKey): Promise<BlacklistEntry | null>;
}
