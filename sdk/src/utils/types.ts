import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export enum Preset {
  SSS1 = 0,
  SSS2 = 1,
  SSS3 = 2,
}

export enum Role {
  Minter = 0,
  Burner = 1,
  Seizer = 2,
  Pauser = 3,
  ComplianceOfficer = 4,
}

export interface CreateMintParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  preset: Preset;
  transferHookProgram?: PublicKey;
  treasury?: PublicKey;
}

export interface MintToParams {
  mint: PublicKey;
  to: PublicKey;
  amount: BN;
}

export interface BurnFromParams {
  mint: PublicKey;
  from: PublicKey;
  amount: BN;
}

export interface SeizeParams {
  mint: PublicKey;
  from: PublicKey;
  treasuryAta: PublicKey;
  amount: BN;
}

export interface GrantRoleParams {
  mint: PublicKey;
  holder: PublicKey;
  role: Role;
  allowance: BN;
}

export interface BlacklistParams {
  mint: PublicKey;
  wallet: PublicKey;
}

export interface SetMetadataParams {
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}

export interface StablecoinInfo {
  admin: PublicKey;
  pendingAdmin: PublicKey;
  mint: PublicKey;
  preset: number;
  paused: boolean;
  transferHookProgram: PublicKey | null;
  treasury: PublicKey | null;
  totalMinted: BN;
  totalBurned: BN;
  totalSeized: BN;
}

export interface RoleInfo {
  config: PublicKey;
  holder: PublicKey;
  role: Role;
  allowance: BN;
}
