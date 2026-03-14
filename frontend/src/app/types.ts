export type Preset = 'SSS-1' | 'SSS-2' | 'Custom';
export type Environment = 'mainnet-beta' | 'devnet' | 'localnet';

export interface StablecoinSummary {
  address: string;
  configAddress: string;
  masterAuthority: string;
  preset: Preset;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  treasury: string;
  complianceEnabled: boolean;
  transferHookEnabled: boolean;
  paused: boolean;
  supply: bigint;
  minterQuota: bigint;
  minterWindow: number;
  transferHookConfig?: string;
  extraAccountMetaList?: string;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  action: string;
  details: string;
  actor: string;
  status: 'success' | 'failed' | 'pending';
  signature?: string;
}

export interface MinterRecord {
  address: string;
  active: boolean;
  quota: bigint;
  minted: bigint;
  windowSeconds: number;
}

export interface HolderRecord {
  tokenAccount: string;
  owner: string;
  balance: bigint;
  isBlacklisted: boolean;
  isFrozen: boolean;
}

export interface Lockfile {
  version: number;
  rpcUrl: string;
  stablecoinProgramId: string;
  transferHookProgramId: string;
  mint: string;
  config: string;
  masterMinterRole: string;
  transferHookConfig?: string;
  extraAccountMetaList?: string;
  createdAt: string;
  preset?: Preset;
  name?: string;
  symbol?: string;
  uri?: string;
  decimals?: number;
  treasury?: string;
  complianceEnabled?: boolean;
  transferHookEnabled?: boolean;
}

export interface OperatorSigner {
  label: string;
  secretKey: Uint8Array;
}

export interface CreateStablecoinFormValues {
  preset: Preset;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  treasury: string;
  initialMinterQuota: string;
  initialMinterWindowSeconds: string;
  enableCompliance: boolean;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  seizeRequiresBlacklist: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  variant: 'success' | 'error';
  explorerUrl?: string;
}
