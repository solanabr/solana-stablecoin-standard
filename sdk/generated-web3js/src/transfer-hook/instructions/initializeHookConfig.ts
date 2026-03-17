import {
  AccountMeta,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { TRANSFERHOOK_PROGRAM_ID } from "..";
import { findHookConfigPda } from "../pdas/hookConfig";
import {
  fixCodecSize,
  getBytesCodec,
  getStructCodec,
  transformCodec,
} from "@solana/codecs";

export interface InitializeHookConfigInstructionAccounts {
  payer: PublicKey;
  hookConfig?: PublicKey;
  systemProgram: PublicKey;
}

export interface InitializeHookConfigInstructionArgs {
  stablecoinProgramId: PublicKey;
}

const InitializeHookConfigInstructionDataCodec = getStructCodec([
  [
    "stablecoinProgramId",
    transformCodec(
      fixCodecSize(getBytesCodec(), 32),
      (value: PublicKey) => value.toBytes(),
      (value) => new PublicKey(value),
    ),
  ],
]);

export function createInitializeHookConfigInstruction(
  accounts: InitializeHookConfigInstructionAccounts,
  args: InitializeHookConfigInstructionArgs,
  programId: PublicKey = TRANSFERHOOK_PROGRAM_ID,
): TransactionInstruction {
  let hookConfig = accounts.hookConfig;
  if (!hookConfig) {
    const [derived] = findHookConfigPda(programId);
    hookConfig = derived;
  }
  const keys: AccountMeta[] = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: hookConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ];
  const instructionData = Buffer.from(
    InitializeHookConfigInstructionDataCodec.encode(args),
  );
  const discriminator = Buffer.from("90ef1155e430362b", "hex");
  const data = Buffer.concat([discriminator, instructionData]);

  return new TransactionInstruction({ keys, programId, data });
}
