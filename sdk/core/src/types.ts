import type { PublicKey, Transaction } from "@solana/web3.js";

export enum Preset {
  SSS_1 = "sss-1",
  SSS_2 = "sss-2",
}

export interface StablecoinConfig {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  // SSS-2 only
  enablePermanentDelegate?: boolean;
  enableTransferHook?: boolean;
  defaultAccountFrozen?: boolean;
}

export interface CreateOptions {
  preset?: Preset;
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  // Custom overrides (ignored when preset is set)
  extensions?: {
    permanentDelegate?: boolean;
    transferHook?: boolean;
    defaultAccountFrozen?: boolean;
  };
}

export interface MintOptions {
  recipient: PublicKey;
  amount: bigint;
  minter?: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> };
}

export interface MinterRecord {
  mint: PublicKey;
  minter: PublicKey;
  cap: bigint | null;
  minted: bigint;
  active: boolean;
}

export interface BlacklistEntry {
  mint: PublicKey;
  address: PublicKey;
  blacklistedBy: PublicKey;
  reason: string;
  timestamp: number;
}

export interface StablecoinStateAccount {
  mint: PublicKey;
  authority: PublicKey;
  freezeAuthority: PublicKey;
  permanentDelegate: PublicKey | null;
  preset: number;
  decimals: number;
  paused: boolean;
  enableTransferHook: boolean;
  enablePermanentDelegate: boolean;
  defaultAccountFrozen: boolean;
  burners: PublicKey[];
  pausers: PublicKey[];
  blacklisters: PublicKey[];
  seizers: PublicKey[];
  name: string;
  symbol: string;
  uri: string;
}

export type RoleKind = "Burner" | "Pauser" | "Blacklister" | "Seizer";
