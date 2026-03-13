import {
  type Commitment,
  type Connection,
  Keypair,
  PublicKey,
  Transaction,
  type SendOptions
} from "@solana/web3.js";

import type { TransactionAuthority, WalletSigner } from "./types.js";

export interface SendTransactionParams {
  connection: Connection;
  transaction: Transaction;
  signer: Keypair | WalletSigner;
  extraSigners?: Keypair[];
  commitment?: Commitment;
  sendOptions?: SendOptions;
}

export function resolvePublicKey(authority: TransactionAuthority): PublicKey {
  return authority instanceof PublicKey ? authority : authority.publicKey;
}

export function isKeypair(value: TransactionAuthority | WalletSigner): value is Keypair {
  return value instanceof Keypair;
}

export async function prepareTransaction(params: {
  connection: Connection;
  transaction: Transaction;
  feePayer: PublicKey;
  commitment?: Commitment;
}): Promise<{ transaction: Transaction; lastValidBlockHeight: number }> {
  const commitment = params.commitment ?? "confirmed";
  const latestBlockhash = await params.connection.getLatestBlockhash(commitment);
  params.transaction.feePayer = params.feePayer;
  params.transaction.recentBlockhash = latestBlockhash.blockhash;
  return {
    transaction: params.transaction,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
  };
}

export async function signAndSendTransaction(params: SendTransactionParams): Promise<string> {
  const commitment = params.commitment ?? "confirmed";
  const feePayer = isKeypair(params.signer) ? params.signer.publicKey : params.signer.publicKey;
  const prepared = await prepareTransaction({
    connection: params.connection,
    transaction: params.transaction,
    feePayer,
    commitment
  });
  const transaction = prepared.transaction;

  if (params.extraSigners?.length) {
    transaction.partialSign(...params.extraSigners);
  }

  let rawTransaction: Uint8Array;
  if (isKeypair(params.signer)) {
    transaction.partialSign(params.signer);
    rawTransaction = transaction.serialize();
  } else {
    const signed = await params.signer.signTransaction(transaction);
    rawTransaction = signed.serialize();
  }

  const signature = await params.connection.sendRawTransaction(rawTransaction, params.sendOptions);
  await params.connection.confirmTransaction(
    {
      signature,
      blockhash: transaction.recentBlockhash!,
      lastValidBlockHeight: prepared.lastValidBlockHeight
    },
    commitment
  );
  return signature;
}
