import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMint2Instruction,
  createInitializeMetadataPointerInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createInitializeDefaultAccountStateInstruction,
  getMintLen,
  ExtensionType,
  AccountState,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  pack,
  type TokenMetadata,
} from "@solana/spl-token-metadata";
import { deriveConfigPda, SSS_HOOK_PROGRAM_ID } from "../pda";

export interface Sss2MintOptions {
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  hookProgramId?: PublicKey;
}

/**
 * Build a transaction that creates a Token-2022 mint for SSS-2 (Compliant preset).
 *
 * Extensions: MetadataPointer, PermanentDelegate, TransferHook, DefaultAccountState(Frozen)
 * Metadata: on-chain Token Metadata
 *
 * New token accounts start frozen (DefaultAccountState.Frozen), requiring explicit thaw
 * by a freezer before the holder can transact. The transfer hook enforces blacklist checks.
 */
export async function createSss2MintTransaction(
  connection: Connection,
  payer: PublicKey,
  mintKeypair: Keypair,
  options: Sss2MintOptions,
  coreProgramId: PublicKey,
): Promise<Transaction> {
  const [configPda] = deriveConfigPda(mintKeypair.publicKey, coreProgramId);
  const hookProgramId = options.hookProgramId ?? SSS_HOOK_PROGRAM_ID;
  const decimals = options.decimals ?? 6;

  const extensions = [
    ExtensionType.MetadataPointer,
    ExtensionType.PermanentDelegate,
    ExtensionType.TransferHook,
    ExtensionType.DefaultAccountState,
  ];
  const mintLen = getMintLen(extensions);

  const metadata: TokenMetadata = {
    mint: mintKeypair.publicKey,
    name: options.name,
    symbol: options.symbol,
    uri: options.uri ?? "",
    additionalMetadata: [],
    updateAuthority: configPda,
  };
  const metadataLen = pack(metadata).length;
  const totalLen = mintLen + metadataLen;

  const lamports =
    await connection.getMinimumBalanceForRentExemption(totalLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mintKeypair.publicKey,
      configPda,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializePermanentDelegateInstruction(
      mintKeypair.publicKey,
      configPda,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeTransferHookInstruction(
      mintKeypair.publicKey,
      configPda,
      hookProgramId,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeDefaultAccountStateInstruction(
      mintKeypair.publicKey,
      AccountState.Frozen,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMint2Instruction(
      mintKeypair.publicKey,
      decimals,
      configPda, // mint authority = config PDA
      configPda, // freeze authority = config PDA
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      mint: mintKeypair.publicKey,
      metadata: mintKeypair.publicKey,
      name: options.name,
      symbol: options.symbol,
      uri: options.uri ?? "",
      mintAuthority: configPda,
      updateAuthority: configPda,
    }),
  );

  return tx;
}
