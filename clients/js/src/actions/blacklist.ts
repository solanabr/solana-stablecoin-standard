import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { deriveConfigPda, deriveMintAuthorityPda, deriveBlacklistPda } from "../pda";

export async function blacklistAdd(
  program: anchor.Program,
  mint: PublicKey,
  wallet: PublicKey,
  reason: string,
  blacklister: Keypair,
  walletTokenAccount?: PublicKey
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [mintAuthority] = deriveMintAuthorityPda(mint);
  const [blacklistPda] = deriveBlacklistPda(mint, wallet);

  const tokenAccount =
    walletTokenAccount ??
    getAssociatedTokenAddressSync(mint, wallet, false, TOKEN_2022_PROGRAM_ID);

  return program.methods
    .blacklistAdd(reason)
    .accounts({
      blacklister: blacklister.publicKey,
      config: configPda,
      mint,
      wallet,
      blacklistEntry: blacklistPda,
      mintAuthority,
      walletTokenAccount: tokenAccount,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([blacklister])
    .rpc();
}

export async function blacklistRemove(
  program: anchor.Program,
  mint: PublicKey,
  wallet: PublicKey,
  blacklister: Keypair
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [blacklistPda] = deriveBlacklistPda(mint, wallet);

  return program.methods
    .blacklistRemove()
    .accounts({
      blacklister: blacklister.publicKey,
      config: configPda,
      mint,
      wallet,
      blacklistEntry: blacklistPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([blacklister])
    .rpc();
}

export async function isBlacklisted(
  program: anchor.Program,
  mint: PublicKey,
  wallet: PublicKey
): Promise<boolean> {
  const [blacklistPda] = deriveBlacklistPda(mint, wallet);
  const info = await program.provider.connection.getAccountInfo(blacklistPda);
  return info !== null;
}
