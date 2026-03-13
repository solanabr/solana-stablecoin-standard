use anchor_lang::prelude::*;

use crate::{
    constants::{BLACKLIST_SEED, HOOK_CONFIG_SEED},
    error::StablecoinError,
    events::AddressRemovedFromBlacklist,
    state::{Blacklist, HookConfig},
};

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [HOOK_CONFIG_SEED, hook_config.mint.as_ref()],
        bump = hook_config.bump,
        constraint = hook_config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// CHECK: The address to remove from blacklist
    pub address: UncheckedAccount<'info>,

    #[account(
        mut,
        close = authority,
        seeds = [BLACKLIST_SEED, hook_config.key().as_ref(), address.key().as_ref()],
        bump = blacklist.bump,
    )]
    pub blacklist: Account<'info, Blacklist>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    emit!(AddressRemovedFromBlacklist {
        hook_config: ctx.accounts.hook_config.key(),
        address: ctx.accounts.address.key(),
        removed_by: ctx.accounts.authority.key(),
    });

    Ok(())
}
