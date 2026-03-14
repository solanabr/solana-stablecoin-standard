import type { PublicKey, Connection, Signer } from "@solana/web3.js";
import type BN from "bn.js";

export enum Presets {
  SSS_1 = "sss-1",
  SSS_2 = "sss-2",
  SSS_3 = "sss-3",
}

export interface StablecoinExtensions {
  permanentDelegate: boolean;
  transferHook: boolean;
  defaultAccountFrozen: boolean;
  confidentialTransfers: boolean;
}

export interface StablecoinConfig {
  name: string;
  symbol: string;
  uri?: string;
  decimals: number;
  preset?: Presets;
  authority?: Signer;
  extensions: StablecoinExtensions;
}

export interface CreateStablecoinParams
  extends Partial<Omit<StablecoinConfig, "extensions">> {
  connection?: Connection;
  authority?: Signer;
  preset?: Presets;
  extensions?: Partial<StablecoinExtensions>;
  enableAllowlist?: boolean;
  supplyCap?: BN;
}

export interface MintParams {
  recipient: PublicKey;
  amount: BN;
}

export interface BurnParams {
  amount: BN;
}

export interface SeizeParams {
  from: PublicKey;
  to: PublicKey;
  amount: BN;
}

export interface AllowlistParams {
  address: PublicKey;
}

export interface OracleConfigParams {
  priceFeed: PublicKey;
  maxDeviationBps: number;
  maxStalenessSecs: BN;
  enabled: boolean;
}

export interface StablecoinStatus {
  mint: PublicKey;
  authority: PublicKey;
  pendingAuthority: PublicKey | null;
  paused: boolean;
  complianceEnabled: boolean;
  totalMinted: BN;
  totalBurned: BN;
  supplyCap: BN;
  enableAllowlist: boolean;
}

export interface RoleInfo {
  config: PublicKey;
  holder: PublicKey;
  role: number;
  active: boolean;
  grantedBy: PublicKey;
  grantedAt: BN;
}

export interface QuotaInfo {
  config: PublicKey;
  minter: PublicKey;
  quotaLimit: BN;
  mintedAmount: BN;
}

export type OutputFormat = "table" | "json" | "csv";
export type Cluster = "devnet" | "mainnet-beta" | "testnet" | "localnet";
