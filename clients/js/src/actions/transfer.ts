import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { TransferParams } from "../types";
import {
  deriveConfigPda,
  deriveMintAuthorityPda,
  deriveBlacklistPda,
  deriveExtraAccountMetaListPda,
  STABLECOIN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../pda";

export async function transfer(
  program: anchor.Program,
  mint: PublicKey,
  params: TransferParams,
  decimals: number,
  hasTransferHook: boolean = false,
  transferHookProgramId: PublicKey = TRANSFER_HOOK_PROGRAM_ID
): Promise<string> {
  const connection = program.provider.connection;
  const fromAta = getAssociatedTokenAddressSync(
    mint,
    params.from.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  const toAta = getAssociatedTokenAddressSync(
    mint,
    params.to,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const tx = new Transaction();

  // Create recipient ATA if it doesn't exist
  const toAtaInfo = await connection.getAccountInfo(toAta);
  if (!toAtaInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        params.from.publicKey,
        toAta,
        params.to,
        mint,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  // Build transfer_checked instruction
  const transferIx = createTransferCheckedInstruction(
    fromAta,
    mint,
    toAta,
    params.from.publicKey,
    BigInt(params.amount.toString()),
    decimals,
    [],
    TOKEN_2022_PROGRAM_ID
  );

  // Add transfer hook accounts if needed
  if (hasTransferHook) {
    const [extraAccountMetaList] = deriveExtraAccountMetaListPda(
      mint,
      transferHookProgramId
    );
    const [configPda] = deriveConfigPda(mint);
    const [sourceBlacklist] = deriveBlacklistPda(mint, params.from.publicKey);
    const [destBlacklist] = deriveBlacklistPda(mint, params.to);

    transferIx.keys.push(
      { pubkey: extraAccountMetaList, isSigner: false, isWritable: false },
      { pubkey: transferHookProgramId, isSigner: false, isWritable: false },
      { pubkey: STABLECOIN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: sourceBlacklist, isSigner: false, isWritable: false },
      { pubkey: destBlacklist, isSigner: false, isWritable: false }
    );
  }

  tx.add(transferIx);

  const provider = program.provider as anchor.AnchorProvider;
  return provider.sendAndConfirm(tx, [params.from]);
}
