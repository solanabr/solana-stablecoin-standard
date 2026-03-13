import { PublicKey, Keypair, Connection } from "@solana/web3.js";

export enum Preset {
  SSS_1 = "sss-1",
  SSS_2 = "sss-2",
}

export interface StablecoinCreateParams {
  /** Use a predefined preset (SSS-1 or SSS-2) */
  preset?: Preset;
  /** Human-readable name */
  name: string;
  /** Ticker symbol */
  symbol: string;
  /** Token decimals (default: 6) */
  decimals?: number;
  /** Metadata URI */
  uri?: string;
  /** Master authority keypair */
  authority: Keypair;
  /** Custom extension overrides (ignored if preset is set) */
  extensions?: {
    permanentDelegate?: boolean;
    transferHook?: boolean;
    defaultAccountFrozen?: boolean;
  };
}

export interface StablecoinInfo {
  address: PublicKey;
  mint: PublicKey;
  authority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  paused: boolean;
  totalMinted: bigint;
  totalBurned: bigint;
}

export interface MintParams {
  recipient: PublicKey;
  amount: number | bigint;
  minter: Keypair;
}

export interface BurnParams {
  amount: number | bigint;
  burner: Keypair;
  tokenAccount?: PublicKey;
}

export interface FreezeParams {
  tokenAccount: PublicKey;
  freezer: Keypair;
}

export interface ThawParams {
  tokenAccount: PublicKey;
  freezer: Keypair;
}

export interface BlacklistParams {
  address: PublicKey;
  reason: string;
  blacklister: Keypair;
}

export interface SeizeParams {
  fromTokenAccount: PublicKey;
  toTokenAccount: PublicKey;
  seizer: Keypair;
}

export interface MinterInfo {
  address: PublicKey;
  quota: bigint;
  minted: bigint;
  active: boolean;
}

export interface RoleInfo {
  holder: PublicKey;
  roles: number;
  isMinter: boolean;
  isBurner: boolean;
  isPauser: boolean;
  isBlacklister: boolean;
  isSeizer: boolean;
  isFreezer: boolean;
}

export const ROLE_FLAGS = {
  MINTER: 1 << 0,
  BURNER: 1 << 1,
  PAUSER: 1 << 2,
  BLACKLISTER: 1 << 3,
  SEIZER: 1 << 4,
  FREEZER: 1 << 5,
} as const;

export interface SupplyInfo {
  currentSupply: bigint;
  totalMinted: bigint;
  totalBurned: bigint;
}

export interface AuditLogEntry {
  action: string;
  account: string;
  authority: string;
  amount?: string;
  reason?: string;
  timestamp: number;
  signature: string;
}
