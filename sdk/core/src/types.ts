import { PublicKey } from "@solana/web3.js";

export enum RoleType {
  Admin = 0,
  Minter = 1,
  Burner = 2,
  Freezer = 3,
  Blacklister = 4,
}

export interface StablecoinConfig {
  admin: PublicKey;
  mint: PublicKey;
  decimals: number;
  rolesEnabled: boolean;
  freezeEnabled: boolean;
  paused: boolean;
  name: string;
  symbol: string;
  uri: string;
  bump: number;
}

export interface Role {
  roleType: number;
  config: PublicKey;
  authority: PublicKey;
  grantedBy: PublicKey;
  grantedAt: number;
  bump: number;
}

export interface HookConfig {
  authority: PublicKey;
  mint: PublicKey;
  complianceEnabled: boolean;
  bump: number;
}

export interface BlacklistEntry {
  hookConfig: PublicKey;
  address: PublicKey;
  bump: number;
}

export interface InitializeParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  rolesEnabled: boolean;
  freezeEnabled: boolean;
}
