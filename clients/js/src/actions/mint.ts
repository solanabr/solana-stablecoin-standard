import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { MintParams } from "../types";
import { deriveConfigPda, deriveMintAuthorityPda, deriveMinterPda } from "../pda";

export async function mintTokens(
  program: anchor.Program,
  mint: PublicKey,
  params: MintParams
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [mintAuthority] = deriveMintAuthorityPda(mint);
  const [minterPda] = deriveMinterPda(mint, params.minter.publicKey);

  const recipientAta = getAssociatedTokenAddressSync(
    mint,
    params.recipient,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  return program.methods
    .mintTokens(new anchor.BN(params.amount.toString()))
    .accounts({
      minter: params.minter.publicKey,
      config: configPda,
      minterAllowance: minterPda,
      mint,
      mintAuthority,
      recipientTokenAccount: recipientAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([params.minter])
    .rpc();
}
