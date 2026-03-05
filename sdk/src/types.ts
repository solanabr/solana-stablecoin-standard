import { PublicKey, Connection, Keypair, TransactionInstruction } from '@solana/web3.js';

export interface StablecoinConfig {
  authority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  decimals: number;
  paused: boolean;
  totalMinted: number;
  totalBurned: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enablePrivacy: boolean;
  proposedAuthority: PublicKey | null;
  bump: number;
}

export interface RoleRegistry {
  config: PublicKey;
  master: PublicKey;
  minters: MinterEntry[];
  burners: PublicKey[];
  pausers: PublicKey[];
  blacklisters: PublicKey[];
  seizers: PublicKey[];
  bump: number;
}

export interface MinterEntry {
  address: PublicKey;
  quota: number;
  minted: number;
}

export interface BlacklistEntry {
  config: PublicKey;
  address: PublicKey;
  reason: string;
  blacklistedAt: number;
  blacklistedBy: PublicKey;
  bump: number;
}

export interface HolderInfo {
  address: PublicKey;
  balance: number;
}

export interface AuditLogEntry {
  timestamp: number;
  action: string;
  address: PublicKey;
  details: any;
}

export type RoleType = 'burner' | 'pauser' | 'blacklister' | 'seizer';
export type UpdateRoleAction = 'add' | 'remove';
export type UpdateMinterAction = 
  | { type: 'add'; quota: number }
  | { type: 'remove' }
  | { type: 'updateQuota'; newQuota: number };

export interface StablecoinCreateConfig {
  connection: Connection;
  payer: Keypair;
  name: string;
  symbol: string;
  decimals: number;
  preset: PresetType;
  authority?: Keypair;
}

export type PresetType = 'SSS_1' | 'SSS_2' | 'SSS_3' | 'custom';

export interface PresetConfig {
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enablePrivacy: boolean;
}

export const Presets = {
  SSS_1: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    enablePrivacy: false,
  },
  SSS_2: {
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
    enablePrivacy: false,
  },
  SSS_3: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    enablePrivacy: true,
  },
} as const;

export interface ViewKeyScope {
  type: 'issuer' | 'compliance' | 'auditor';
  mint?: PublicKey;
  constraints?: {
    addresses?: PublicKey[];
    timeRange?: [Date, Date];
  };
}
