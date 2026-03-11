import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  deriveConfigPda,
  deriveMintAuthorityPda,
  deriveBlacklistPda,
  deriveExtraAccountMetaListPda,
  STABLECOIN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../pda";

export async function seize(
  program: anchor.Program,
  mint: PublicKey,
  targetWallet: PublicKey,
  treasuryOwner: PublicKey,
  amount: bigint,
  owner: Keypair,
  hasTransferHook: boolean = false,
  transferHookProgramId: PublicKey = TRANSFER_HOOK_PROGRAM_ID
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [mintAuthority] = deriveMintAuthorityPda(mint);
  const [blacklistPda] = deriveBlacklistPda(mint, targetWallet);

  const sourceAta = getAssociatedTokenAddressSync(
    mint,
    targetWallet,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  const treasuryAta = getAssociatedTokenAddressSync(
    mint,
    treasuryOwner,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const remainingAccounts: anchor.web3.AccountMeta[] = [];

  if (hasTransferHook) {
    const [extraAccountMetaList] = deriveExtraAccountMetaListPda(
      mint,
      transferHookProgramId
    );
    const [sourceBlacklist] = deriveBlacklistPda(mint, mintAuthority);
    const [destBlacklist] = deriveBlacklistPda(mint, treasuryOwner);

    remainingAccounts.push(
      { pubkey: extraAccountMetaList, isSigner: false, isWritable: false },
      { pubkey: transferHookProgramId, isSigner: false, isWritable: false },
      { pubkey: STABLECOIN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: sourceBlacklist, isSigner: false, isWritable: false },
      { pubkey: destBlacklist, isSigner: false, isWritable: false }
    );
  }

  return program.methods
    .seize(new anchor.BN(amount.toString()))
    .accounts({
      owner: owner.publicKey,
      config: configPda,
      mint,
      mintAuthority,
      blacklistEntry: blacklistPda,
      targetWallet,
      sourceTokenAccount: sourceAta,
      treasuryTokenAccount: treasuryAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .signers([owner])
    .rpc();
}
