import type { Wallet } from '@coral-xyz/anchor';
import type { PublicKey, Signer } from '@solana/web3.js';
import { Presets } from './presets.js';

export type TransactionAuthority = Signer | Wallet;

export interface StablecoinAddresses {
  mint: PublicKey;
  metadata?: PublicKey;
  config: PublicKey;
  masterMinterRole: PublicKey;
  transferHookConfig?: PublicKey;
  extraAccountMetaList?: PublicKey;
}

export interface RoleConfiguration {
  pauser?: PublicKey;
  burner?: PublicKey;
  blacklister?: PublicKey;
  seizer?: PublicKey;
  treasury: PublicKey;
}

export interface ExtensionConfiguration {
  enableCompliance: boolean;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  seizeRequiresBlacklist: boolean;
}

export interface PresetCreateParams {
  payer: TransactionAuthority;
  authority?: TransactionAuthority;
  preset: Presets;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  treasury: PublicKey;
  initialMinterQuota: bigint;
  initialMinterWindowSeconds: number;
  transferHookProgramId?: PublicKey;
  stablecoinProgramId?: PublicKey;
}

export interface CustomCreateParams {
  payer: TransactionAuthority;
  authority?: TransactionAuthority;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  extensions: ExtensionConfiguration;
  roles: RoleConfiguration;
  initialMinterQuota: bigint;
  initialMinterWindowSeconds: number;
  transferHookProgramId?: PublicKey;
  stablecoinProgramId?: PublicKey;
}

export type CreateStablecoinParams = PresetCreateParams | CustomCreateParams;

export interface UpdateMinterInput {
  minter: PublicKey;
  active: boolean;
  quotaAmount: bigint;
  windowSeconds: number;
  resetWindow?: boolean;
}

export interface UpdateRolesInput {
  pauser?: PublicKey;
  burner?: PublicKey;
  blacklister?: PublicKey;
  seizer?: PublicKey;
  treasury?: PublicKey;
}

export interface SeizeInput {
  authority: TransactionAuthority;
  sourceTokenAccount: PublicKey;
  destinationTokenAccount: PublicKey;
  sourceOwner: PublicKey;
  amount: bigint;
  overrideRequiresBlacklist?: boolean;
}

export interface SolanaStablecoinCreateResult {
  client: unknown;
  addresses: StablecoinAddresses;
}
