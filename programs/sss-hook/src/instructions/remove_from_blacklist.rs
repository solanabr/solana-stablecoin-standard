use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::error::HookError;
use crate::state::*;
use sss_core::state::StablecoinConfig;
use sss_events::RemovedFromBlacklist;

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    pub blacklister: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        constraint = stablecoin_config.mint == mint.key() @ HookError::InvalidConfig,
        constraint = blacklister.key() == stablecoin_config.blacklister @ HookError::NotBlacklister,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), blacklist_entry.wallet.as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.blacklisted @ HookError::NotBlacklisted,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn handle_remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    let wallet = ctx.accounts.blacklist_entry.wallet;

    // Keep account for audit trail, just flip the flag
    ctx.accounts.blacklist_entry.blacklisted = false;

    emit!(RemovedFromBlacklist {
        mint: ctx.accounts.mint.key(),
        wallet,
        removed_by: ctx.accounts.blacklister.key(),
    });

    Ok(())
}
