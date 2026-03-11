import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { deriveConfigPda, deriveMintAuthorityPda } from "../pda";

export async function freezeAccount(
  program: anchor.Program,
  mint: PublicKey,
  targetWallet: PublicKey,
  authority: Keypair
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [mintAuthority] = deriveMintAuthorityPda(mint);
  const tokenAccount = getAssociatedTokenAddressSync(
    mint,
    targetWallet,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  return program.methods
    .freezeAccount()
    .accounts({
      authority: authority.publicKey,
      config: configPda,
      mint,
      mintAuthority,
      tokenAccount,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc();
}

export async function thawAccount(
  program: anchor.Program,
  mint: PublicKey,
  targetWallet: PublicKey,
  authority: Keypair
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [mintAuthority] = deriveMintAuthorityPda(mint);
  const tokenAccount = getAssociatedTokenAddressSync(
    mint,
    targetWallet,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  return program.methods
    .thawAccount()
    .accounts({
      authority: authority.publicKey,
      config: configPda,
      mint,
      mintAuthority,
      tokenAccount,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc();
}
