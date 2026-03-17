import {
  AccountMeta,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { TRANSFERHOOK_PROGRAM_ID } from "..";
import { findExtraAccountMetaListPda } from "../pdas/extraAccountMetaList";
import { findHookConfigPda } from "../pdas/hookConfig";
import { getStructCodec, getU64Codec } from "@solana/codecs";

export interface TransferHookInstructionAccounts {
  source: PublicKey;
  mint: PublicKey;
  destination: PublicKey;
  authority: PublicKey;
  extraAccountMetaList?: PublicKey;
  transferHookProgram: PublicKey;
  hookConfig?: PublicKey;
  stablecoinProgram: PublicKey;
  config: PublicKey;
  sourceBlacklist: PublicKey;
  destinationBlacklist: PublicKey;
}

export interface TransferHookInstructionArgs {
  amount: bigint;
}

const TransferHookInstructionDataCodec = getStructCodec([
  ["amount", getU64Codec()],
]);

export function createTransferHookInstruction(
  accounts: TransferHookInstructionAccounts,
  args: TransferHookInstructionArgs,
  programId: PublicKey = TRANSFERHOOK_PROGRAM_ID,
): TransactionInstruction {
  let extraAccountMetaList = accounts.extraAccountMetaList;
  if (!extraAccountMetaList) {
    const [derived] = findExtraAccountMetaListPda(
      {
        mint: accounts.mint,
      },
      programId,
    );
    extraAccountMetaList = derived;
  }
  let hookConfig = accounts.hookConfig;
  if (!hookConfig) {
    const [derived] = findHookConfigPda(programId);
    hookConfig = derived;
  }
  const keys: AccountMeta[] = [
    { pubkey: accounts.source, isSigner: false, isWritable: false },
    { pubkey: accounts.mint, isSigner: false, isWritable: false },
    { pubkey: accounts.destination, isSigner: false, isWritable: false },
    { pubkey: accounts.authority, isSigner: false, isWritable: false },
    { pubkey: extraAccountMetaList, isSigner: false, isWritable: false },
    {
      pubkey: accounts.transferHookProgram,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: hookConfig, isSigner: false, isWritable: false },
    { pubkey: accounts.stablecoinProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.config, isSigner: false, isWritable: false },
    { pubkey: accounts.sourceBlacklist, isSigner: false, isWritable: false },
    {
      pubkey: accounts.destinationBlacklist,
      isSigner: false,
      isWritable: false,
    },
  ];
  const instructionData = Buffer.from(
    TransferHookInstructionDataCodec.encode(args),
  );
  const discriminator = Buffer.from("692565c54bfb661a", "hex");
  const data = Buffer.concat([discriminator, instructionData]);

  return new TransactionInstruction({ keys, programId, data });
}
