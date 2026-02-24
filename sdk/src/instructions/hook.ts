import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { SssTransferHook } from "../idl/sss_transfer_hook";
import {
  deriveBlacklistPda,
  deriveConfigPda,
  deriveExtraAccountMetasPda,
  deriveRolePda,
  SSS_CORE_PROGRAM_ID,
} from "../pda";

/**
 * Build the `initializeExtraAccountMetas` instruction.
 * Creates the ExtraAccountMetaList PDA required for Token-2022 transfer hooks.
 * Must be called once per mint after mint creation.
 *
 * Auto-resolved by Anchor: extraAccountMetas (PDA), systemProgram (known address)
 */
export function buildInitializeExtraAccountMetasIx(
  program: Program<SssTransferHook>,
  mint: PublicKey,
  payer: PublicKey,
) {
  return program.methods
    .initializeExtraAccountMetas()
    .accounts({
      payer,
      mint,
    })
    .instruction();
}

/**
 * Build the `addToBlacklist` instruction.
 * Adds an address to the blacklist for a given mint. Admin-only (verified via core program).
 *
 * Auto-resolved by Anchor: blacklistEntry (PDA), systemProgram (known address)
 */
export function buildAddToBlacklistIx(
  program: Program<SssTransferHook>,
  mint: PublicKey,
  authority: PublicKey,
  address: PublicKey,
  reason: string,
  coreProgramId: PublicKey = SSS_CORE_PROGRAM_ID,
) {
  // The hook program verifies admin authorization by checking the admin_role PDA
  // exists and is owned by the sss-core program.
  const [configPda] = deriveConfigPda(mint, coreProgramId);
  const [adminRolePda] = deriveRolePda(
    configPda,
    authority,
    "admin",
    coreProgramId,
  );

  return program.methods
    .addToBlacklist(reason)
    .accounts({
      authority,
      adminRole: adminRolePda,
      mint,
      address,
    })
    .instruction();
}

/**
 * Build the `removeFromBlacklist` instruction.
 * Removes an address from the blacklist. Admin-only (verified via core program).
 *
 * Auto-resolved by Anchor: blacklistEntry (PDA)
 */
export function buildRemoveFromBlacklistIx(
  program: Program<SssTransferHook>,
  mint: PublicKey,
  authority: PublicKey,
  address: PublicKey,
  coreProgramId: PublicKey = SSS_CORE_PROGRAM_ID,
) {
  const [blacklistEntryPda] = deriveBlacklistPda(
    mint,
    address,
    program.programId,
  );

  const [configPda] = deriveConfigPda(mint, coreProgramId);
  const [adminRolePda] = deriveRolePda(
    configPda,
    authority,
    "admin",
    coreProgramId,
  );

  // blacklistEntry PDA has self-referential seeds (blacklist_entry.address),
  // so Anchor cannot auto-resolve it. Use accountsPartial to override.
  return program.methods
    .removeFromBlacklist()
    .accountsPartial({
      authority,
      adminRole: adminRolePda,
      mint,
      blacklistEntry: blacklistEntryPda,
    })
    .instruction();
}
