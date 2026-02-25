use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::BlacklistEntry;

use super::admin_verify::verify_blacklister_for_mint;

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
  #[account(mut)]
  pub blacklister: Signer<'info>,

  /// CHECK: The sss-core RoleAccount PDA proving the authority has Blacklister role.
  /// Verified by checking owner == sss-core program ID and re-deriving the
  /// expected PDA address from known seeds using the mint key.
  pub blacklister_role: UncheckedAccount<'info>,

  /// CHECK: The stablecoin mint this blacklist entry applies to.
  pub mint: UncheckedAccount<'info>,

  #[account(
    mut,
    close = blacklister,
    seeds = [BLACKLIST_SEED, mint.key().as_ref(), blacklist_entry.address.as_ref()],
    bump = blacklist_entry.bump,
  )]
  pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn handler_remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
  let mint_key = ctx.accounts.blacklist_entry.mint;

  // Verify the caller has Blacklister role in sss-core for this mint.
  verify_blacklister_for_mint(
    &ctx.accounts.blacklister_role.to_account_info(),
    &mint_key,
    &ctx.accounts.blacklister.key(),
  )?;

  // Account closure handled by Anchor via `close = blacklister`.
  Ok(())
}
