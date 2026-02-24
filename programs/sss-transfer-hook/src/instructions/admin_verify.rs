use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::TransferHookError;

/// Verifies that the provided admin_role account is a valid sss-core Admin
/// RoleAccount PDA for the given mint and authority.
///
/// First re-derives the sss-core config PDA from the mint, then verifies
/// the admin_role PDA matches the expected derivation for that config.
/// This ensures the admin_role is actually tied to the correct stablecoin.
pub fn verify_admin_for_mint(
  admin_role: &AccountInfo,
  mint_key: &Pubkey,
  authority_key: &Pubkey,
) -> Result<()> {
  // The account must be owned by the sss-core program.
  require!(
    admin_role.owner == &SSS_CORE_PROGRAM_ID,
    TransferHookError::Unauthorized
  );

  // Re-derive the sss-core config PDA from the mint.
  let (sss_config_pda, _config_bump) = Pubkey::find_program_address(
    &[SSS_CONFIG_SEED, mint_key.as_ref()],
    &SSS_CORE_PROGRAM_ID,
  );

  // Re-derive the expected admin role PDA and verify it matches.
  // Seeds: [b"sss-role", config_key, authority_key, &[Role::Admin = 0]]
  let (expected_pda, _bump) = Pubkey::find_program_address(
    &[
      SSS_ROLE_SEED,
      sss_config_pda.as_ref(),
      authority_key.as_ref(),
      &[0u8], // Role::Admin = 0
    ],
    &SSS_CORE_PROGRAM_ID,
  );

  require!(
    admin_role.key() == expected_pda,
    TransferHookError::Unauthorized
  );

  Ok(())
}
