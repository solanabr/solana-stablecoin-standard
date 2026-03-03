use anchor_lang::prelude::*;
use crate::state::{HookConfig, BlacklistEntry};
use crate::error::HookError;

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The authority - must match hook_config.authority
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"hook_config", hook_config.mint.as_ref()],
        bump = hook_config.bump,
        constraint = hook_config.authority == authority.key() @ HookError::Unauthorized,
    )]
    pub hook_config: Account<'info, HookConfig>,

    #[account(
        init,
        payer = payer,
        space = BlacklistEntry::LEN,
        seeds = [b"blacklist", hook_config.key().as_ref(), wallet.as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddToBlacklist>, wallet: Pubkey) -> Result<()> {
    let entry = &mut ctx.accounts.blacklist_entry;
    entry.config = ctx.accounts.hook_config.key();
    entry.wallet = wallet;
    entry.blacklisted_at = Clock::get()?.unix_timestamp;
    entry.bump = ctx.bumps.blacklist_entry;
    Ok(())
}
