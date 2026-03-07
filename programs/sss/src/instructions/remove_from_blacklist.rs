use anchor_lang::prelude::*;

use crate::constants::{BLACKLIST_SEED, CONFIG_SEED};
use crate::events::RemoveFromBlacklistEvent;
use crate::state::StablecoinConfig;
use crate::state::blacklist::BlacklistedEntry;

#[event_cpi]
#[derive(Accounts)]
#[instruction(_wallet: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,
    /// CHECK: Token-2022 mint. Used as seed component.
    pub mint: UncheckedAccount<'info>,
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        mut,
        close = blacklister,
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), _wallet.as_ref()],
        bump = blacklisted_entry.bump,
    )]
    pub blacklisted_entry: Account<'info, BlacklistedEntry>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RemoveFromBlacklist>, _wallet: Pubkey) -> Result<()> {
    ctx.accounts.config.assert_sss2()?;
    ctx.accounts.config.assert_transfer_hook_enabled()?;
    ctx.accounts.blacklisted_entry.is_blacklisted = false;

    emit_cpi!(RemoveFromBlacklistEvent {
        wallet: _wallet,
        mint: ctx.accounts.mint.key(),
    });

    msg!("Removed {} from blacklist", _wallet);
    Ok(())
}