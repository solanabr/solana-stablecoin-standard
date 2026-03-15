import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { Wallet } from "@stbr/sss-client";

export interface WalletAdapterLike {
  publicKey: import("@solana/web3.js").PublicKey | null;
  signTransaction?:
    | (<T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>)
    | undefined;
  signAllTransactions?:
    | (<T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>)
    | undefined;
}

export function toSdkWallet(adapter: WalletAdapterLike | null): Wallet | null {
  if (
    !adapter?.publicKey ||
    typeof adapter.signTransaction !== "function" ||
    typeof adapter.signAllTransactions !== "function"
  ) {
    return null;
  }
  return {
    publicKey: adapter.publicKey,
    signTransaction: adapter.signTransaction.bind(adapter),
    signAllTransactions: adapter.signAllTransactions.bind(adapter),
  };
}
