import { Buffer } from "buffer";

import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta
} from "@solana/web3.js";

import { concatBytes, encodeU64LE, utf8Bytes } from "./bytes.js";
import {
  BLACKLIST_ENTRY_SEED,
  PROOF_RECEIPT_SEED,
  STABLECOIN_CONFIG_SEED
} from "./constants.js";
import { anchorDiscriminator, interfaceDiscriminator } from "./hash.js";
function encodeU64(value: bigint): Uint8Array {
  return encodeU64LE(value);
}

function readonly(pubkey: PublicKey, isSigner = false): AccountMeta {
  return { pubkey, isSigner, isWritable: false };
}

function writable(pubkey: PublicKey, isSigner = false): AccountMeta {
  return { pubkey, isSigner, isWritable: true };
}

export function findTransferHookMetaListPda(mint: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [utf8Bytes("extra-account-metas"), mint.toBytes()],
    programId
  )[0];
}

export function findProofReceiptPda(
  mint: PublicKey,
  subject: PublicKey,
  stablecoinProgramId: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [utf8Bytes(PROOF_RECEIPT_SEED), mint.toBytes(), subject.toBytes()],
    stablecoinProgramId
  )[0];
}

export function buildInitializeExtraAccountMetaListInstruction(params: {
  payer: PublicKey;
  mint: PublicKey;
  transferHookProgramId: PublicKey;
}): TransactionInstruction {
  const metaList = findTransferHookMetaListPda(params.mint, params.transferHookProgramId);
  return new TransactionInstruction({
    programId: params.transferHookProgramId,
    keys: [
      writable(params.payer, true),
      readonly(params.mint),
      writable(metaList),
      readonly(SystemProgram.programId)
    ],
    data: Buffer.from(anchorDiscriminator("initialize_extra_account_meta_list"))
  });
}

export function buildExecuteTransferHookInstruction(params: {
  transferHookProgramId: PublicKey;
  stablecoinProgramId: PublicKey;
  mint: PublicKey;
  source: PublicKey;
  destination: PublicKey;
  authority: PublicKey;
  sourceOwner?: PublicKey;
  destinationOwner?: PublicKey;
  amount: bigint;
}): TransactionInstruction {
  const metaList = findTransferHookMetaListPda(params.mint, params.transferHookProgramId);
  const config = PublicKey.findProgramAddressSync(
    [utf8Bytes(STABLECOIN_CONFIG_SEED), params.mint.toBytes()],
    params.stablecoinProgramId
  )[0];
  const sourceOwner = params.sourceOwner ?? params.authority;
  const blacklist = PublicKey.findProgramAddressSync(
    [utf8Bytes(BLACKLIST_ENTRY_SEED), params.mint.toBytes(), sourceOwner.toBytes()],
    params.stablecoinProgramId
  )[0];
  const proofReceipt = findProofReceiptPda(params.mint, sourceOwner, params.stablecoinProgramId);
  const destinationOwner = params.destinationOwner ?? params.destination;
  const destinationBlacklist = PublicKey.findProgramAddressSync(
    [utf8Bytes(BLACKLIST_ENTRY_SEED), params.mint.toBytes(), destinationOwner.toBytes()],
    params.stablecoinProgramId
  )[0];
  const destinationProofReceipt = findProofReceiptPda(
    params.mint,
    destinationOwner,
    params.stablecoinProgramId
  );

  return new TransactionInstruction({
    programId: params.transferHookProgramId,
    keys: [
      readonly(params.source),
      readonly(params.mint),
      readonly(params.destination),
      readonly(params.authority),
      readonly(metaList),
      readonly(params.stablecoinProgramId),
      readonly(config),
      readonly(blacklist),
      readonly(proofReceipt),
      readonly(destinationBlacklist),
      readonly(destinationProofReceipt)
    ],
    data: Buffer.from(concatBytes([
      interfaceDiscriminator("spl-transfer-hook-interface:execute"),
      encodeU64(params.amount)
    ]))
  });
}
