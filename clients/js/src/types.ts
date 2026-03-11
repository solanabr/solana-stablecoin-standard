import { PublicKey, Keypair, Connection, TransactionSignature } from "@solana/web3.js";

export enum Presets {
  SSS_1 = "sss1",
  SSS_2 = "sss2",
  SSS_3 = "sss3",
  Custom = "custom",
}

export interface CreateStablecoinParams {
  preset: Presets;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  authority: Keypair;
  masterMinter: PublicKey;
  pauser: PublicKey;
  blacklister?: PublicKey;
  auditorElgamalPubkey?: number[];
  extensions?: {
    permanentDelegate?: boolean;
    transferHook?: boolean;
    confidentialTransfers?: boolean;
    defaultAccountFrozen?: boolean;
  };
  transferHookProgramId?: PublicKey;
}

export interface CreateStablecoinResult {
  mint: PublicKey;
  configPda: PublicKey;
  mintAuthority: PublicKey;
  txSignature: TransactionSignature;
}

export interface MintParams {
  recipient: PublicKey;
  amount: bigint;
  minter: Keypair;
}

export interface BurnParams {
  amount: bigint;
  burner: Keypair;
}

export interface TransferParams {
  from: Keypair;
  to: PublicKey;
  amount: bigint;
}

export interface StablecoinConfigData {
  mint: PublicKey;
  preset: string;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  owner: PublicKey;
  pendingOwner: PublicKey | null;
  masterMinter: PublicKey;
  pauser: PublicKey;
  blacklister: PublicKey;
  isPaused: boolean;
  totalMinted: bigint;
  totalBurned: bigint;
  enableTransferHook: boolean;
  enablePermanentDelegate: boolean;
  enableConfidentialTransfers: boolean;
  defaultAccountFrozen: boolean;
}
