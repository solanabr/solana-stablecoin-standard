import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { deriveConfigPda, deriveMinterPda, deriveRolePda } from "../pda";

export type RoleType = "owner" | "masterMinter" | "minter" | "pauser" | "blacklister";

function roleToAnchorEnum(role: RoleType): Record<string, Record<string, never>> {
  switch (role) {
    case "owner":
      return { owner: {} };
    case "masterMinter":
      return { masterMinter: {} };
    case "minter":
      return { minter: {} };
    case "pauser":
      return { pauser: {} };
    case "blacklister":
      return { blacklister: {} };
  }
}

export async function assignRole(
  program: anchor.Program,
  mint: PublicKey,
  role: RoleType,
  assignee: PublicKey,
  authority: Keypair
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [rolePda] = deriveRolePda(mint, role, assignee);

  return program.methods
    .assignRole(roleToAnchorEnum(role), assignee)
    .accounts({
      authority: authority.publicKey,
      config: configPda,
      roleAssignment: rolePda,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
}

export async function revokeRole(
  program: anchor.Program,
  mint: PublicKey,
  role: RoleType,
  assignee: PublicKey,
  authority: Keypair
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [rolePda] = deriveRolePda(mint, role, assignee);

  return program.methods
    .revokeRole()
    .accounts({
      authority: authority.publicKey,
      config: configPda,
      roleAssignment: rolePda,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
}

export async function addMinter(
  program: anchor.Program,
  mint: PublicKey,
  minter: PublicKey,
  allowance: bigint,
  masterMinter: Keypair
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [minterPda] = deriveMinterPda(mint, minter);

  return program.methods
    .addMinter(minter, new anchor.BN(allowance.toString()))
    .accounts({
      authority: masterMinter.publicKey,
      config: configPda,
      minterAllowance: minterPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([masterMinter])
    .rpc();
}

export async function removeMinter(
  program: anchor.Program,
  mint: PublicKey,
  minter: PublicKey,
  masterMinter: Keypair
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [minterPda] = deriveMinterPda(mint, minter);

  return program.methods
    .removeMinter()
    .accounts({
      authority: masterMinter.publicKey,
      config: configPda,
      minterAllowance: minterPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([masterMinter])
    .rpc();
}

export async function updateMinterAllowance(
  program: anchor.Program,
  mint: PublicKey,
  minter: PublicKey,
  newAllowance: bigint,
  masterMinter: Keypair
): Promise<string> {
  const [configPda] = deriveConfigPda(mint);
  const [minterPda] = deriveMinterPda(mint, minter);

  return program.methods
    .updateMinterAllowance(new anchor.BN(newAllowance.toString()))
    .accounts({
      authority: masterMinter.publicKey,
      config: configPda,
      minterAllowance: minterPda,
    })
    .signers([masterMinter])
    .rpc();
}
