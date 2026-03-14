import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Idl } from "@coral-xyz/anchor";
import { Preset, StablecoinConfig } from "./presets";

export interface CreateOptions {
  /** High-level preset — SSS_1 or SSS_2 */
  preset?: Preset;
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  authority: Keypair;
  /** Optional: override individual extension flags (ignored when preset is provided without custom) */
  extensions?: {
    permanentDelegate?: boolean;
    transferHook?: boolean;
    defaultAccountFrozen?: boolean;
  };
  connection: Connection;
  /** Provide an existing mint keypair, otherwise one is generated */
  mintKeypair?: Keypair;
  /** Optional: provide the IDL directly (for local/test environments where IDL is not on-chain) */
  idl?: Idl;
  /** Optional: provide the transfer-hook IDL directly (for local/test environments) */
  transferHookIdl?: Idl;
}

export interface MintOptions {
  recipient: PublicKey;
  amount: number | bigint;
  minter: Keypair;
}

export interface TransferOptions {
  /** Wallet (owner) sending the tokens */
  from: Keypair;
  /** Wallet (owner) receiving the tokens */
  to: PublicKey;
  /** Amount in base units (e.g. lamport-scale for decimals=6: 1_000_000 = 1 token) */
  amount: number | bigint;
  /** Optional fee-payer — defaults to `from` */
  payer?: Keypair;
}

export interface StablecoinSdkContext {
  connection: Connection;
  mint: PublicKey;
  statePDA: PublicKey;
  authority: Keypair;
  config: StablecoinConfig;
}
