import { PublicKey } from "@solana/web3.js";

export type Preset = "sss-1" | "sss-2" | "sss-3";
export type RoleType = "admin" | "minter" | "freezer" | "pauser" | "burner" | "blacklister" | "seizer";

export interface StablecoinCreateOptions {
  preset: Preset;
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  supplyCap?: bigint;
}

export interface StablecoinInfo {
  mint: PublicKey;
  authority: PublicKey;
  preset: Preset;
  paused: boolean;
  supplyCap: bigint | null;
  totalMinted: bigint;
  totalBurned: bigint;
  currentSupply: bigint;
}

export interface RoleInfo {
  config: PublicKey;
  address: PublicKey;
  role: RoleType;
  grantedBy: PublicKey;
  grantedAt: Date;
}

export interface BlacklistInfo {
  mint: PublicKey;
  address: PublicKey;
  addedBy: PublicKey;
  addedAt: Date;
  reason: string;
}

export const ROLE_MAP: Record<RoleType, number> = {
  admin: 0,
  minter: 1,
  freezer: 2,
  pauser: 3,
  burner: 4,
  blacklister: 5,
  seizer: 6,
};

export const PRESET_MAP: Record<Preset, number> = {
  "sss-1": 1,
  "sss-2": 2,
  "sss-3": 3,
};

export const REVERSE_PRESET_MAP: Record<number, Preset> = {
  1: "sss-1",
  2: "sss-2",
  3: "sss-3",
};

export const Presets = {
  SSS_1: "sss-1" as const,
  SSS_2: "sss-2" as const,
  SSS_3: "sss-3" as const,
} as const;

export interface StablecoinExtensionConfig {
  permanentDelegate?: boolean;
  transferHook?: boolean;
  defaultAccountFrozen?: boolean;
  confidentialTransfer?: boolean;
}

export interface StablecoinCustomOptions {
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  supplyCap?: bigint;
  extensions: StablecoinExtensionConfig;
}
