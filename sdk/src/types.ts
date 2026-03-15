import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// --- Enums ---

export enum StablecoinPreset {
  SSS1 = "sss1",
  SSS2 = "sss2",
  SSS3 = "sss3",
  Custom = "custom",
}

export enum Role {
  MasterAuthority = "masterAuthority",
  Pauser = "pauser",
  Blacklister = "blacklister",
  Seizer = "seizer",
}

// --- Account Types ---

export interface StablecoinConfig {
  bump: number;
  mint: PublicKey;
  masterAuthority: PublicKey;
  pendingAuthority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  preset: { [K in StablecoinPreset]?: {} };
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enableConfidentialTransfers: boolean;
  isPaused: boolean;
  supplyCap: BN;
  totalMinted: BN;
  totalBurned: BN;
  totalSeized: BN;
  auditLogIndex: BN;
  reserveAttestationIndex: BN;
  createdAt: BN;
  updatedAt: BN;
}

export interface RoleRegistry {
  bump: number;
  config: PublicKey;
  masterAuthority: PublicKey;
  pauser: PublicKey;
  blacklister: PublicKey;
  seizer: PublicKey;
}

export interface MinterInfo {
  bump: number;
  config: PublicKey;
  minter: PublicKey;
  isActive: boolean;
  mintQuota: BN;
  totalMinted: BN;
  createdAt: BN;
  lastMintAt: BN;
}

export interface BlacklistEntry {
  bump: number;
  config: PublicKey;
  blockedAddress: PublicKey;
  reason: string;
  blacklistedBy: PublicKey;
  blacklistedAt: BN;
}

export interface AllowlistEntry {
  bump: number;
  config: PublicKey;
  address: PublicKey;
  addedBy: PublicKey;
  addedAt: BN;
  reason: string;
}

export interface ReserveAttestation {
  bump: number;
  config: PublicKey;
  index: BN;
  reserveHash: number[];
  totalReservesUsd: BN;
  totalOutstanding: BN;
  attestedBy: PublicKey;
  attestationUri: string;
  timestamp: BN;
}

// --- Instruction Params ---

export interface InitializeParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  preset: { [K in StablecoinPreset]?: {} };
  enablePermanentDelegate: boolean | null;
  enableTransferHook: boolean | null;
  enableDefaultStateFrozen: boolean | null;
  enableConfidentialTransfers: boolean | null;
}

export interface UpdateRoleParams {
  role: { [K in Role]?: {} };
  newHolder: PublicKey;
}

export interface UpdateMinterParams {
  isActive: boolean;
  mintQuota: BN;
}

export interface BlacklistAddParams {
  reason: string;
}

export interface AllowlistAddParams {
  reason: string;
}

export interface UpdateMetadataParams {
  name: string | null;
  symbol: string | null;
  uri: string | null;
}

export interface AttestReserveParams {
  reserveHash: number[];
  totalReservesUsd: BN;
  attestationUri: string;
}
