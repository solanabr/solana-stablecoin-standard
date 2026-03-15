import { PublicKey } from "@solana/web3.js";

// ─── Program IDs ─────────────────────────────────────────────────
// Replace these after `anchor deploy` with actual deployed program IDs.

export const STABLECOIN_PROGRAM_ID = new PublicKey(
  "8TthCsErsM5Q7yhfYKQ7USSnpFJhsw8MiBvEaqK7D3up"
);

export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "3QdRLCZJ7DKGB1qC45YFzaVo9MijEYW2RrYbeRGpLqqy"
);

export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

// ─── Presets ─────────────────────────────────────────────────────

export enum Presets {
  SSS_1 = "SSS1",
  SSS_2 = "SSS2",
  Custom = "Custom",
}

// ─── Feature Flags ───────────────────────────────────────────────

export interface FeatureFlags {
  freezeAuthority: boolean;
  permanentDelegate: boolean;
  transferHook: boolean;
  confidentialTransfers: boolean;
}

export const SSS1_FEATURES: FeatureFlags = {
  freezeAuthority: true,
  permanentDelegate: false,
  transferHook: false,
  confidentialTransfers: false,
};

export const SSS2_FEATURES: FeatureFlags = {
  freezeAuthority: true,
  permanentDelegate: true,
  transferHook: true,
  confidentialTransfers: false,
};

// ─── Config Types ────────────────────────────────────────────────

export interface StablecoinConfig {
  bump: number;
  mint: PublicKey;
  authority: PublicKey;
  preset: Presets;
  features: FeatureFlags;
  paused: boolean;
  defaultAccountFrozen: boolean;
  totalMinted: bigint;
  totalBurned: bigint;
  decimals: number;
  name: string;
  symbol: string;
  transferHookProgram: PublicKey;
  createdAt: bigint;
  updatedAt: bigint;
}

export interface RoleAssignment {
  bump: number;
  config: PublicKey;
  holder: PublicKey;
  roleMask: number;
  mintQuota: bigint;
  mintedAmount: bigint;
  updatedAt: bigint;
}

export interface BlacklistEntry {
  bump: number;
  mint: PublicKey;
  address: PublicKey;
  createdAt: bigint;
  addedBy: PublicKey;
  reason: string;
}

// ─── Roles ───────────────────────────────────────────────────────

export enum Role {
  Minter = "Minter",
  Burner = "Burner",
  Pauser = "Pauser",
  /** Can add/remove addresses from the blacklist (SSS-2). */
  Blacklister = "Blacklister",
  /** Can seize tokens from blacklisted accounts (SSS-2). */
  Seizer = "Seizer",
}

export enum RoleAction {
  Grant = "Grant",
  Revoke = "Revoke",
}

// ─── Role Bitmask Constants ──────────────────────────────────────

export const ROLE_BITS = {
  [Role.Minter]: 0x01,
  [Role.Burner]: 0x02,
  [Role.Pauser]: 0x04,
  [Role.Blacklister]: 0x08,
  [Role.Seizer]: 0x10,
};

// ─── Initialization Params ───────────────────────────────────────

export interface InitializeParams {
  preset: Presets;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  defaultAccountFrozen?: boolean;
  customFeatures?: FeatureFlags;
  transferHookProgram?: PublicKey;
}

// ─── Event Types ─────────────────────────────────────────────────

export interface StablecoinEvent {
  type: "mint" | "burn" | "freeze" | "thaw" | "pause" | "unpause" | "blacklist" | "unblacklist" | "seize";
  mint: PublicKey;
  authority: PublicKey;
  amount?: bigint;
  target?: PublicKey;
  reason?: string;
  slot: bigint;
  signature: string;
}
