import { PublicKey, Keypair } from '@solana/web3.js';
import BN from 'bn.js';

// ========== Configuration Types ==========

export interface CreateStablecoinParams {
  preset?: Preset;
  name: string;
  symbol: string;
  decimals: number;
  uri?: string;
  authority: Keypair;
  extensions?: {
    permanentDelegate?: boolean;
    transferHook?: boolean;
    defaultAccountFrozen?: boolean;
  };
  roles?: {
    minters?: Array<{ address: PublicKey; dailyQuota: BN }>;
    burners?: PublicKey[];
    blacklisters?: PublicKey[];
    pausers?: PublicKey[];
    seizers?: PublicKey[];
  };
}

export enum Preset {
  SSS_1 = 'sss-1',
  SSS_2 = 'sss-2',
  SSS_3 = 'sss-3',
}

// ========== Operation Types ==========

export interface MintParams {
  recipient: PublicKey;
  amount: BN;
  minter: Keypair;
}

export interface BurnParams {
  amount: BN;
  burner: Keypair;
  tokenAccount: PublicKey;
}

export interface FreezeParams {
  tokenAccount: PublicKey;
  authority: Keypair;
}

export interface BlacklistParams {
  address: PublicKey;
  reason: string;
  blacklister: Keypair;
}

export interface SeizeParams {
  fromAccount: PublicKey;
  toAccount: PublicKey;
  amount: BN;
  seizer: Keypair;
}

export interface UpdateMinterParams {
  minter: PublicKey;
  dailyQuota: BN;
  action: 'add' | 'remove';
  authority: Keypair;
}

export interface UpdateRoleParams {
  roleType: 'burner' | 'blacklister' | 'pauser' | 'seizer';
  account: PublicKey;
  action: 'add' | 'remove';
  authority: Keypair;
}

// ========== State Types ==========

export interface StablecoinState {
  masterAuthority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  isPaused: boolean;
  totalMinted: BN;
  totalBurned: BN;
  complianceEnabled: boolean;
  permanentDelegateEnabled: boolean;
  transferHookEnabled: boolean;
  defaultAccountFrozen: boolean;
  bump: number;
}

export interface MinterAccount {
  minter: PublicKey;
  dailyQuota: BN;
  mintedToday: BN;
  lastMintDay: BN;
  totalMinted: BN;
  isActive: boolean;
  bump: number;
}

export interface RoleAccount {
  account: PublicKey;
  roleType: number;
  isActive: boolean;
  bump: number;
}

export interface BlacklistEntry {
  address: PublicKey;
  reason: string;
  blacklistedAt: BN;
  blacklistedBy: PublicKey;
  isActive: boolean;
  bump: number;
}

// ========== Query Types ==========

export interface StablecoinInfo {
  mint: PublicKey;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: BN;
  totalMinted: BN;
  totalBurned: BN;
  isPaused: boolean;
  complianceEnabled: boolean;
  authority: PublicKey;
}

export interface MinterInfo {
  address: PublicKey;
  dailyQuota: BN;
  mintedToday: BN;
  remainingQuota: BN;
  totalMinted: BN;
  isActive: boolean;
}

export interface HolderInfo {
  address: PublicKey;
  balance: BN;
  isFrozen: boolean;
  isBlacklisted: boolean;
}
