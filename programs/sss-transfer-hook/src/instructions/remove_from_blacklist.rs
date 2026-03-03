use anchor_lang::prelude::*;
use crate::state::{HookConfig, BlacklistEntry};
use crate::error::HookError;

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
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
        mut,
        close = payer,
        seeds = [b"blacklist", hook_config.key().as_ref(), wallet.as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.wallet == wallet @ HookError::NotBlacklisted,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn handler(_ctx: Context<RemoveFromBlacklist>, _wallet: Pubkey) -> Result<()> {
    // Account is closed by the `close = payer` constraint
    Ok(())
}
