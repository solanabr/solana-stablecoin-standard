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
  getMintLen,
  ExtensionType,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  pack,
  type TokenMetadata,
} from "@solana/spl-token-metadata";
import { deriveConfigPda } from "../pda";

export interface Sss1MintOptions {
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
}

/**
 * Build a transaction that creates a Token-2022 mint for SSS-1 (Minimal preset).
 *
 * Extensions: MetadataPointer, PermanentDelegate
 * Metadata: on-chain Token Metadata
 *
 * The config PDA acts as mint authority, freeze authority, and permanent delegate.
 */
export async function createSss1MintTransaction(
  connection: Connection,
  payer: PublicKey,
  mintKeypair: Keypair,
  options: Sss1MintOptions,
  coreProgramId: PublicKey,
): Promise<Transaction> {
  const [configPda] = deriveConfigPda(mintKeypair.publicKey, coreProgramId);
  const decimals = options.decimals ?? 6;

  const extensions = [
    ExtensionType.MetadataPointer,
    ExtensionType.PermanentDelegate,
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
