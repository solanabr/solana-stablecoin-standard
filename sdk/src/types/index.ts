import { PublicKey } from "@solana/web3.js";

export enum Preset {
  SSS1 = 1,
  SSS2 = 2,
}

export enum Role {
  Admin = 1,
  Minter = 2,
  Burner = 4,
  Freezer = 8,
  Blacklister = 16,
  Seizer = 32,
}

export interface TokenInitParams {
  preset: Preset;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  supplyCap: bigint;
  transferHookProgram?: PublicKey;
}

export interface TokenConfigAccount {
  bump: number;
  preset: number;
  mint: PublicKey;
  supplyCap: bigint;
  paused: boolean;
  decimals: number;
  deployer: PublicKey;
  transferHookProgram: PublicKey;
  createdAt: bigint;
}

export interface RoleAccountData {
  bump: number;
  config: PublicKey;
  authority: PublicKey;
  roles: number;
}

export interface BlacklistData {
  bump: number;
  config: PublicKey;
  count: number;
  entries: PublicKey[];
}

export interface TokenStatus {
  config: TokenConfigAccount;
  supply: bigint;
  paused: boolean;
  preset: Preset;
  blacklistCount?: number;
}

export interface MintEvent {
  mint: PublicKey;
  destination: PublicKey;
  amount: bigint;
  authority: PublicKey;
  timestamp: number;
}

export interface BurnEvent {
  mint: PublicKey;
  source: PublicKey;
  amount: bigint;
  authority: PublicKey;
  timestamp: number;
}

export interface TransferEvent {
  mint: PublicKey;
  source: PublicKey;
  destination: PublicKey;
  amount: bigint;
  timestamp: number;
}
