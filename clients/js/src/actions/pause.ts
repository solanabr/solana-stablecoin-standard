import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { deriveConfigPda } from "../pda";

export async function pause(
  program: anchor.Program,
  mint: PublicKey,
  pauser: Keypair
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);

  return program.methods
    .pause()
    .accounts({
      pauser: pauser.publicKey,
      config: configPda,
    })
    .signers([pauser])
    .rpc();
}

export async function unpause(
  program: anchor.Program,
  mint: PublicKey,
  pauser: Keypair
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);

  return program.methods
    .unpause()
    .accounts({
      pauser: pauser.publicKey,
      config: configPda,
    })
    .signers([pauser])
    .rpc();
}
