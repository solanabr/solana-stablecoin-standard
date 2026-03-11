import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { BurnParams } from "../types";
import { deriveConfigPda, deriveMinterPda } from "../pda";

export async function burnTokens(
  program: anchor.Program,
  mint: PublicKey,
  params: BurnParams
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [minterPda] = deriveMinterPda(mint, params.burner.publicKey);

  const burnerAta = getAssociatedTokenAddressSync(
    mint,
    params.burner.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  return program.methods
    .burnTokens(new anchor.BN(params.amount.toString()))
    .accounts({
      burner: params.burner.publicKey,
      config: configPda,
      minterAllowance: minterPda,
      mint,
      burnerTokenAccount: burnerAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([params.burner])
    .rpc();
}
