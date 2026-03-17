import {
  AccountMeta,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { STABLECOIN_PROGRAM_ID } from "..";
import {
  addCodecSizePrefix,
  getBooleanCodec,
  getStructCodec,
  getU32Codec,
  getU8Codec,
  getUtf8Codec,
} from "@solana/codecs";
import { findConfigPda } from "../pdas/config";
import { findEventAuthorityPda } from "../pdas/eventAuthority";
import { findRoleConfigPda } from "../pdas/roleConfig";

export interface InitializeInstructionAccounts {
  authority: PublicKey;
  mint: PublicKey;
  config?: PublicKey;
  roleConfig?: PublicKey;
  extraAccountMetaList?: PublicKey;
  hookConfig?: PublicKey;
  transferHookProgram?: PublicKey;
  tokenProgram: PublicKey;
  systemProgram: PublicKey;
  rent: PublicKey;
  eventAuthority?: PublicKey;
  program: PublicKey;
}

export interface InitializeInstructionArgs {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

const InitializeInstructionDataCodec = getStructCodec([
  ["name", addCodecSizePrefix(getUtf8Codec(), getU32Codec())],
  ["symbol", addCodecSizePrefix(getUtf8Codec(), getU32Codec())],
  ["uri", addCodecSizePrefix(getUtf8Codec(), getU32Codec())],
  ["decimals", getU8Codec()],
  ["enablePermanentDelegate", getBooleanCodec()],
  ["enableTransferHook", getBooleanCodec()],
  ["defaultAccountFrozen", getBooleanCodec()],
]);

export function createInitializeInstruction(
  accounts: InitializeInstructionAccounts,
  args: InitializeInstructionArgs,
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
  let eventAuthority = accounts.eventAuthority;
  if (!eventAuthority) {
    const [derived] = findEventAuthorityPda(programId);
    eventAuthority = derived;
  }
  const keys: AccountMeta[] = [
    { pubkey: accounts.authority, isSigner: true, isWritable: true },
    { pubkey: accounts.mint, isSigner: true, isWritable: true },
    { pubkey: config, isSigner: false, isWritable: true },
    { pubkey: roleConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.program, isSigner: false, isWritable: false },
    ...(accounts.extraAccountMetaList
      ? [
          {
            pubkey: accounts.extraAccountMetaList,
            isSigner: false,
            isWritable: true,
          },
        ]
      : []),
    ...(accounts.hookConfig
      ? [{ pubkey: accounts.hookConfig, isSigner: false, isWritable: false }]
      : []),
    ...(accounts.transferHookProgram
      ? [
          {
            pubkey: accounts.transferHookProgram,
            isSigner: false,
            isWritable: false,
          },
        ]
      : []),
  ];
  const instructionData = Buffer.from(
    InitializeInstructionDataCodec.encode(args),
  );
  const discriminator = Buffer.from("afaf6d1f0d989bed", "hex");
  const data = Buffer.concat([discriminator, instructionData]);

  return new TransactionInstruction({ keys, programId, data });
}
