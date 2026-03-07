use anchor_lang::prelude::*;

use crate::constants::{BLACKLIST_SEED, CONFIG_SEED};
use crate::events::AddToBlacklistEvent;
use crate::state::StablecoinConfig;
use crate::state::blacklist::BlacklistedEntry;

#[event_cpi]
#[derive(Accounts)]
#[instruction(_wallet: Pubkey, _reason: String)]
pub struct AddToBlacklist<'info> {
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
        init_if_needed,
        payer = blacklister,
        space = BlacklistedEntry::DISCRIMINATOR.len() + BlacklistedEntry::INIT_SPACE,
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), _wallet.as_ref()],
        bump,
    )]
    pub blacklisted_entry: Account<'info, BlacklistedEntry>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddToBlacklist>, _wallet: Pubkey, reason: String) -> Result<()> {
    ctx.accounts.config.assert_sss2()?;
    ctx.accounts.config.assert_transfer_hook_enabled()?;
    require!(reason.len() <= 100, crate::error::StableError::InvalidReasonLength);
    ctx.accounts.blacklisted_entry.is_blacklisted = true;
    ctx.accounts.blacklisted_entry.bump = ctx.bumps.blacklisted_entry;
    ctx.accounts.blacklisted_entry.reason = reason.clone();

    emit_cpi!(AddToBlacklistEvent {
        blacklisted: _wallet,
        mint: ctx.accounts.mint.key(),
        reason,
    });

    msg!("Added {} to blacklist", _wallet);
    Ok(())
}