import {
  AccountMeta,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { STABLECOIN_PROGRAM_ID } from "..";
import { findConfigPda } from "../pdas/config";
import { findEventAuthorityPda } from "../pdas/eventAuthority";
import { findExtraAccountMetaListPda } from "../pdas/extraAccountMetaList";
import { findRoleConfigPda } from "../pdas/roleConfig";
import { getStructCodec, getU64Codec } from "@solana/codecs";

export interface SeizeInstructionAccounts {
  authority: PublicKey;
  config?: PublicKey;
  roleConfig?: PublicKey;
  mint: PublicKey;
  from: PublicKey;
  to: PublicKey;
  blacklistEntry: PublicKey;
  stablecoinProgram: PublicKey;
  transferHookProgram: PublicKey;
  hookConfig: PublicKey;
  extraAccountMetaList?: PublicKey;
  destinationBlacklist: PublicKey;
  tokenProgram: PublicKey;
  eventAuthority?: PublicKey;
  program: PublicKey;
}

export interface SeizeInstructionArgs {
  amount: bigint;
}

const SeizeInstructionDataCodec = getStructCodec([["amount", getU64Codec()]]);

export function createSeizeInstruction(
  accounts: SeizeInstructionAccounts,
  args: SeizeInstructionArgs,
  programId: PublicKey = STABLECOIN_PROGRAM_ID,
): TransactionInstruction {
  let config = accounts.config;
  if (!config) {
    const [derived] = findConfigPda(
      {
        mint: accounts.mint,
      },
      programId,
    );
    config = derived;
  }
  let roleConfig = accounts.roleConfig;
  if (!roleConfig) {
    const [derived] = findRoleConfigPda(
      {
        mint: accounts.mint,
      },
      programId,
    );
    roleConfig = derived;
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
  let eventAuthority = accounts.eventAuthority;
  if (!eventAuthority) {
    const [derived] = findEventAuthorityPda(programId);
    eventAuthority = derived;
  }
  const keys: AccountMeta[] = [
    { pubkey: accounts.authority, isSigner: true, isWritable: false },
    { pubkey: config, isSigner: false, isWritable: true },
    { pubkey: roleConfig, isSigner: false, isWritable: false },
    { pubkey: accounts.mint, isSigner: false, isWritable: true },
    { pubkey: accounts.from, isSigner: false, isWritable: true },
    { pubkey: accounts.to, isSigner: false, isWritable: true },
    { pubkey: accounts.blacklistEntry, isSigner: false, isWritable: false },
    { pubkey: accounts.stablecoinProgram, isSigner: false, isWritable: false },
    {
      pubkey: accounts.transferHookProgram,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.hookConfig, isSigner: false, isWritable: false },
    { pubkey: extraAccountMetaList, isSigner: false, isWritable: false },
    {
      pubkey: accounts.destinationBlacklist,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.program, isSigner: false, isWritable: false },
  ];
  const instructionData = Buffer.from(SeizeInstructionDataCodec.encode(args));
  const discriminator = Buffer.from("819f8f1fa1e0f154", "hex");
  const data = Buffer.concat([discriminator, instructionData]);

  return new TransactionInstruction({ keys, programId, data });
}
