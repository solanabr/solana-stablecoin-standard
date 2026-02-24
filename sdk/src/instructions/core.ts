import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type { SssCore } from "../idl/sss_core";
import { deriveConfigPda, deriveRolePda } from "../pda";
import type { RoleType } from "../types";
import { ROLE_MAP } from "../types";

/**
 * Build the `initialize` instruction.
 * Creates the StablecoinConfig PDA and grants the authority an admin role.
 *
 * Auto-resolved by Anchor: config (PDA), systemProgram (known address)
 */
export function buildInitializeIx(
  program: Program<SssCore>,
  mint: PublicKey,
  authority: PublicKey,
  args: {
    preset: number;
    name: string;
    symbol: string;
    uri: string;
    decimals: number;
    supplyCap: BN | null;
  },
) {
  const [configPda] = deriveConfigPda(mint, program.programId);
  const [adminRolePda] = deriveRolePda(
    configPda,
    authority,
    "admin",
    program.programId,
  );

  return program.methods
    .initialize({
      preset: args.preset,
      name: args.name,
      symbol: args.symbol,
      uri: args.uri,
      decimals: args.decimals,
      supplyCap: args.supplyCap,
    })
    .accounts({
      authority,
      mint,
      adminRole: adminRolePda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
}

/**
 * Build the `mintTokens` instruction.
 * Mints new tokens to the specified token account.
 *
 * Auto-resolved by Anchor: config (PDA)
 */
export function buildMintTokensIx(
  program: Program<SssCore>,
  mint: PublicKey,
  minter: PublicKey,
  to: PublicKey,
  amount: BN,
) {
  const [configPda] = deriveConfigPda(mint, program.programId);
  const [minterRolePda] = deriveRolePda(
    configPda,
    minter,
    "minter",
    program.programId,
  );

  return program.methods
    .mintTokens(amount)
    .accounts({
      minter,
      mint,
      minterRole: minterRolePda,
      to,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
}

/**
 * Build the `burnTokens` instruction.
 * Burns tokens from the specified token account. Requires minter role (minters can burn).
 *
 * Auto-resolved by Anchor: config (PDA)
 */
export function buildBurnTokensIx(
  program: Program<SssCore>,
  mint: PublicKey,
  burner: PublicKey,
  from: PublicKey,
  amount: BN,
) {
  const [configPda] = deriveConfigPda(mint, program.programId);
  const [burnerRolePda] = deriveRolePda(
    configPda,
    burner,
    "minter",
    program.programId,
  );

  return program.methods
    .burnTokens(amount)
    .accounts({
      burner,
      mint,
      burnerRole: burnerRolePda,
      from,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
}

/**
 * Build the `freezeAccount` instruction.
 * Freezes a token account, preventing all transfers.
 *
 * Auto-resolved by Anchor: config (PDA)
 */
export function buildFreezeAccountIx(
  program: Program<SssCore>,
  mint: PublicKey,
  freezer: PublicKey,
  tokenAccount: PublicKey,
) {
  const [configPda] = deriveConfigPda(mint, program.programId);
  const [freezerRolePda] = deriveRolePda(
    configPda,
    freezer,
    "freezer",
    program.programId,
  );

  return program.methods
    .freezeAccount()
    .accounts({
      freezer,
      mint,
      freezerRole: freezerRolePda,
      tokenAccount,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
}

/**
 * Build the `thawAccount` instruction.
 * Thaws a frozen token account, restoring transfer capability.
 *
 * Auto-resolved by Anchor: config (PDA)
 */
export function buildThawAccountIx(
  program: Program<SssCore>,
  mint: PublicKey,
  freezer: PublicKey,
  tokenAccount: PublicKey,
) {
  const [configPda] = deriveConfigPda(mint, program.programId);
  const [freezerRolePda] = deriveRolePda(
    configPda,
    freezer,
    "freezer",
    program.programId,
  );

  return program.methods
    .thawAccount()
    .accounts({
      freezer,
      mint,
      freezerRole: freezerRolePda,
      tokenAccount,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
}

/**
 * Build the `pause` instruction.
 * Pauses all operations (mint, burn, freeze, thaw) for this stablecoin.
 *
 * Auto-resolved by Anchor: config (PDA, seeded by config.mint)
 */
export function buildPauseIx(
  program: Program<SssCore>,
  configPda: PublicKey,
  pauser: PublicKey,
) {
  const [pauserRolePda] = deriveRolePda(
    configPda,
    pauser,
    "pauser",
    program.programId,
  );

  return program.methods
    .pause()
    .accounts({
      pauser,
      pauserRole: pauserRolePda,
    })
    .instruction();
}

/**
 * Build the `unpause` instruction.
 * Unpauses operations for this stablecoin.
 *
 * Auto-resolved by Anchor: config (PDA, seeded by config.mint)
 */
export function buildUnpauseIx(
  program: Program<SssCore>,
  configPda: PublicKey,
  pauser: PublicKey,
) {
  const [pauserRolePda] = deriveRolePda(
    configPda,
    pauser,
    "pauser",
    program.programId,
  );

  return program.methods
    .unpause()
    .accounts({
      pauser,
      pauserRole: pauserRolePda,
    })
    .instruction();
}

/**
 * Build the `seize` instruction.
 * Forcibly transfers tokens from one account to another using permanent delegate.
 * Admin-only, works even when paused (emergency measure).
 *
 * Auto-resolved by Anchor: config (PDA)
 */
export function buildSeizeIx(
  program: Program<SssCore>,
  mint: PublicKey,
  admin: PublicKey,
  from: PublicKey,
  to: PublicKey,
  amount: BN,
) {
  const [configPda] = deriveConfigPda(mint, program.programId);
  const [adminRolePda] = deriveRolePda(
    configPda,
    admin,
    "admin",
    program.programId,
  );

  return program.methods
    .seize(amount)
    .accounts({
      admin,
      mint,
      adminRole: adminRolePda,
      from,
      to,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
}

/**
 * Build the `grantRole` instruction.
 * Grants a role to an address. Only admins can grant roles.
 *
 * Auto-resolved by Anchor: config (PDA), systemProgram (known address)
 */
export function buildGrantRoleIx(
  program: Program<SssCore>,
  configPda: PublicKey,
  admin: PublicKey,
  grantee: PublicKey,
  role: RoleType,
) {
  const [adminRolePda] = deriveRolePda(
    configPda,
    admin,
    "admin",
    program.programId,
  );
  const [roleAccountPda] = deriveRolePda(
    configPda,
    grantee,
    role,
    program.programId,
  );

  return program.methods
    .grantRole(ROLE_MAP[role])
    .accounts({
      admin,
      adminRole: adminRolePda,
      grantee,
      roleAccount: roleAccountPda,
    })
    .instruction();
}

/**
 * Build the `revokeRole` instruction.
 * Revokes a role from an address. Only admins can revoke roles.
 * Closes the role account and returns rent to the admin.
 *
 * Auto-resolved by Anchor: config (PDA)
 */
export function buildRevokeRoleIx(
  program: Program<SssCore>,
  configPda: PublicKey,
  admin: PublicKey,
  roleAccountPda: PublicKey,
) {
  const [adminRolePda] = deriveRolePda(
    configPda,
    admin,
    "admin",
    program.programId,
  );

  return program.methods
    .revokeRole()
    .accounts({
      admin,
      adminRole: adminRolePda,
      roleAccount: roleAccountPda,
    })
    .instruction();
}

/**
 * Build the `updateSupplyCap` instruction.
 * Updates the supply cap for the stablecoin. Admin-only.
 * Pass null to remove the supply cap.
 *
 * Auto-resolved by Anchor: config (PDA)
 */
export function buildUpdateSupplyCapIx(
  program: Program<SssCore>,
  configPda: PublicKey,
  admin: PublicKey,
  newSupplyCap: BN | null,
) {
  const [adminRolePda] = deriveRolePda(
    configPda,
    admin,
    "admin",
    program.programId,
  );

  return program.methods
    .updateSupplyCap(newSupplyCap)
    .accounts({
      admin,
      adminRole: adminRolePda,
    })
    .instruction();
}
