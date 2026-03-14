import type { Wallet } from '@coral-xyz/anchor';
import {
  type Commitment,
  type ConfirmOptions,
  type Connection,
  type Keypair,
  type Signer,
  Transaction,
  type VersionedTransaction,
} from '@solana/web3.js';

export function isSigner(value: Signer | Wallet): value is Signer {
  return 'secretKey' in value;
}

export function signerWallet(signer: Signer): Wallet {
  return {
    payer: signer as Keypair,
    publicKey: signer.publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      if (tx instanceof Transaction) {
        tx.partialSign(signer);
      } else {
        tx.sign([signer]);
      }
      return tx;
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      txs.forEach((tx) => {
        if (tx instanceof Transaction) {
          tx.partialSign(signer);
        } else {
          tx.sign([signer]);
        }
      });
      return txs;
    },
  };
}

export function normalizeWallet(input: Signer | Wallet): Wallet {
  return isSigner(input) ? signerWallet(input) : input;
}

export async function signAndSendTransaction(
  connection: Connection,
  payer: Signer | Wallet,
  transaction: Transaction,
  additionalSigners: Signer[] = [],
  confirmOptions?: ConfirmOptions,
): Promise<string> {
  const commitment = (confirmOptions?.commitment ?? 'confirmed') as Commitment;
  const latestBlockhash = await connection.getLatestBlockhash(commitment);

  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = latestBlockhash.blockhash;

  if (additionalSigners.length > 0) {
    transaction.partialSign(...additionalSigners);
  }

  if (isSigner(payer)) {
    if (!additionalSigners.some((signer) => signer.publicKey.equals(payer.publicKey))) {
      transaction.partialSign(payer);
    }

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      maxRetries: confirmOptions?.maxRetries,
      minContextSlot: confirmOptions?.minContextSlot,
      preflightCommitment: confirmOptions?.preflightCommitment,
      skipPreflight: confirmOptions?.skipPreflight,
    });
    await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      commitment,
    );
    return signature;
  }

  const signed = await payer.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    maxRetries: confirmOptions?.maxRetries,
    minContextSlot: confirmOptions?.minContextSlot,
    preflightCommitment: confirmOptions?.preflightCommitment,
    skipPreflight: confirmOptions?.skipPreflight,
  });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment,
  );
  return signature;
}
