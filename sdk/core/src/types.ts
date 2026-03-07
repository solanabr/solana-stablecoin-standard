import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// ─── On-chain account types ─────────────────────────────────────────────────

export interface StablecoinConfigData {
  authority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  paused: boolean;
  preset: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  burner: PublicKey | null;
  pauser: PublicKey | null;
  blacklister: PublicKey | null;
  seizer: PublicKey | null;
  bump: number;
}

export interface MinterInfoData {
  mint: PublicKey;
  minter: PublicKey;
  quota: BN;
  minted: BN;
  active: boolean;
  bump: number;
}

export interface BlacklistEntryData {
  mint: PublicKey;
  address: PublicKey;
  reason: string;
  timestamp: BN;
  blacklister: PublicKey;
  bump: number;
}

// ─── SDK parameter types ─────────────────────────────────────────────────────

export interface InitializeParams {
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  enablePermanentDelegate?: boolean;
  enableTransferHook?: boolean;
  defaultAccountFrozen?: boolean;
  transferHookProgramId?: PublicKey;
  burner?: PublicKey;
  pauser?: PublicKey;
  blacklister?: PublicKey;
  seizer?: PublicKey;
}

export interface MintParams {
  recipient: PublicKey;
  amount: BN | number | bigint;
}

export interface BurnParams {
  tokenAccount: PublicKey;
  tokenAccountOwner: PublicKey;
  amount: BN | number | bigint;
}

export interface UpdateMinterParams {
  minter: PublicKey;
  quota: BN | number | bigint;
  active: boolean;
}

export interface UpdateRolesParams {
  burner?: PublicKey | null;
  pauser?: PublicKey | null;
  blacklister?: PublicKey | null;
  seizer?: PublicKey | null;
}

export interface SeizeParams {
  fromTokenAccount: PublicKey;
  toTokenAccount: PublicKey;
  amount: BN | number | bigint;
}

// ─── Preset types ────────────────────────────────────────────────────────────

export const PRESET_SSS1 = 1;
export const PRESET_SSS2 = 2;

export interface PresetConfig {
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
}

// ─── Status ──────────────────────────────────────────────────────────────────

export interface StablecoinStatus {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  paused: boolean;
  preset: "SSS-1" | "SSS-2" | "Custom";
  supply: bigint;
  authority: string;
}
