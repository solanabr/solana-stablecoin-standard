import {
  AccountMeta,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { TRANSFERHOOK_PROGRAM_ID } from "..";
import { findExtraAccountMetaListPda } from "../pdas/extraAccountMetaList";
import { findHookConfigPda } from "../pdas/hookConfig";

export interface InitializeExtraAccountMetaListInstructionAccounts {
  payer: PublicKey;
  hookConfig?: PublicKey;
  extraAccountMetaList?: PublicKey;
  mint: PublicKey;
  systemProgram: PublicKey;
}

export function createInitializeExtraAccountMetaListInstruction(
  accounts: InitializeExtraAccountMetaListInstructionAccounts,
  programId: PublicKey = TRANSFERHOOK_PROGRAM_ID,
): TransactionInstruction {
  let hookConfig = accounts.hookConfig;
  if (!hookConfig) {
    const [derived] = findHookConfigPda(programId);
    hookConfig = derived;
  }
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
  const keys: AccountMeta[] = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: hookConfig, isSigner: false, isWritable: false },
    { pubkey: extraAccountMetaList, isSigner: false, isWritable: true },
    { pubkey: accounts.mint, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ];
  const data = Buffer.from("2b220d31a758ebeb", "hex");

  return new TransactionInstruction({ keys, programId, data });
}
