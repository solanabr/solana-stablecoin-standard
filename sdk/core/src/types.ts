import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp"
);
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47"
);

export enum Presets {
  SSS_1 = "sss-1",
  SSS_2 = "sss-2",
}

export interface CreateOptions {
  preset?: Presets;
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;           // default 6
  authority: any;              // Keypair
  // SSS-2 custom config (overrides preset defaults)
  enablePermanentDelegate?: boolean;
  enableTransferHook?: boolean;
  defaultAccountFrozen?: boolean;
}

export interface StablecoinConfigState {
  authority: PublicKey;
  pendingAuthority: PublicKey | null;
  mint: PublicKey;
  paused: boolean;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  hookProgramId: PublicKey | null;
  bump: number;
}

export interface MinterRoleState {
  minter: PublicKey;
  mint: PublicKey;
  quota: BN;
  minted: BN;
  active: boolean;
  bump: number;
}

export interface BlacklistEntryState {
  address: PublicKey;
  mint: PublicKey;
  reason: string;
  blacklistedAt: BN;
  blacklistedBy: PublicKey;
  active: boolean;
  bump: number;
}

export interface RoleType {
  blacklister?: Record<string, never>;
  pauser?: Record<string, never>;
  seizer?: Record<string, never>;
  burner?: Record<string, never>;
  freezer?: Record<string, never>;
}

export const RoleTypes = {
  Blacklister: { blacklister: {} } as RoleType,
  Pauser: { pauser: {} } as RoleType,
  Seizer: { seizer: {} } as RoleType,
  Burner: { burner: {} } as RoleType,
  Freezer: { freezer: {} } as RoleType,
};

export interface MintOptions {
  recipient: PublicKey;
  amount: bigint;
  minter?: any; // Keypair — if omitted, uses authority
}

export interface BlacklistAddOptions {
  address: PublicKey;
  reason: string;
}

export interface SeizeOptions {
  from: PublicKey;   // token account to seize from
  to: PublicKey;     // destination token account
  amount: bigint;
}
