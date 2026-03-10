use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::error::HookError;
use crate::state::*;
use sss_core::state::StablecoinConfig;
use sss_events::AddedToBlacklist;

const MAX_REASON_LEN: usize = 64;

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddToBlacklist<'info> {
    /// Must be the blacklister role from the stablecoin config.
    #[account(mut)]
    pub blacklister: Signer<'info>,

    /// The stablecoin mint.
    pub mint: InterfaceAccount<'info, Mint>,

    /// Core program's StablecoinConfig — cross-program read for role validation.
    #[account(
        constraint = stablecoin_config.mint == mint.key() @ HookError::InvalidConfig,
        constraint = blacklister.key() == stablecoin_config.blacklister @ HookError::NotBlacklister,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    /// Blacklist entry PDA. Created if new, updated if existing.
    #[account(
        init_if_needed,
        payer = blacklister,
        space = 8 + BlacklistEntry::INIT_SPACE,
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), wallet.as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn handle_add_to_blacklist(
    ctx: Context<AddToBlacklist>,
    wallet: Pubkey,
    reason: String,
) -> Result<()> {
    require!(reason.len() <= MAX_REASON_LEN, HookError::ReasonTooLong);

    let entry = &mut ctx.accounts.blacklist_entry;

    // If already blacklisted, no-op but update reason
    entry.mint = ctx.accounts.mint.key();
    entry.wallet = wallet;
    entry.blacklisted = true;
    entry.reason = reason.clone();
    entry.blacklisted_at = Clock::get()?.unix_timestamp;
    entry.blacklisted_by = ctx.accounts.blacklister.key();
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(AddedToBlacklist {
        mint: ctx.accounts.mint.key(),
        wallet,
        reason,
        blacklisted_by: ctx.accounts.blacklister.key(),
    });

    Ok(())
}
