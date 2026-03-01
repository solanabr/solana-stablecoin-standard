import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/** Configuration for initializing a stablecoin. */
export interface StablecoinConfig {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

/** Minter information from on-chain state. */
export interface MinterInfo {
  address: PublicKey;
  quota: BN | null;
  minted: BN;
  active: boolean;
}

/** Blacklist entry from on-chain state. */
export interface BlacklistInfo {
  address: PublicKey;
  reason: string;
  createdAt: BN;
}

/** Role assignment from on-chain state. */
export interface RoleInfo {
  role: Role;
  assignee: PublicKey;
  active: boolean;
}

/** Roles in the SSS system. */
export enum Role {
  Burner = 0,
  Pauser = 1,
  Blacklister = 2,
  Seizer = 3,
}

/** Role seed mapping for PDA derivation. */
export const ROLE_SEEDS: Record<Role, string> = {
  [Role.Burner]: "burner",
  [Role.Pauser]: "pauser",
  [Role.Blacklister]: "blacklister",
  [Role.Seizer]: "seizer",
};

/** On-chain StablecoinState account data. */
export interface StablecoinStateData {
  mint: PublicKey;
  masterAuthority: PublicKey;
  pendingAuthority: PublicKey | null;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  complianceEnabled: boolean;
  permanentDelegateEnabled: boolean;
  transferHookEnabled: boolean;
  defaultAccountFrozen: boolean;
  paused: boolean;
  minterCount: number;
  bump: number;
}
