import * as anchor from "@coral-xyz/anchor";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";

export function createAnchorWallet(authority: Keypair): anchor.Wallet {
  const signOne = <T extends Transaction | VersionedTransaction>(tx: T): T => {
    if (tx instanceof Transaction) {
      tx.partialSign(authority);
    } else {
      tx.sign([authority]);
    }
    return tx;
  };

  return {
    publicKey: authority.publicKey,
    payer: authority,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      return signOne(tx);
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      txs.forEach((tx) => signOne(tx));
      return txs;
    },
  };
}
