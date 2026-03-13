use anchor_lang::prelude::*;

use crate::{
    constants::{BLACKLIST_SEED, HOOK_CONFIG_SEED},
    error::StablecoinError,
    events::AddressBlacklisted,
    state::{Blacklist, HookConfig},
};

#[derive(Accounts)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [HOOK_CONFIG_SEED, hook_config.mint.as_ref()],
        bump = hook_config.bump,
        constraint = hook_config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// CHECK: The address to blacklist
    pub address: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = Blacklist::LEN,
        seeds = [BLACKLIST_SEED, hook_config.key().as_ref(), address.key().as_ref()],
        bump,
    )]
    pub blacklist: Account<'info, Blacklist>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddToBlacklist>) -> Result<()> {
    let blacklist = &mut ctx.accounts.blacklist;
    blacklist.hook_config = ctx.accounts.hook_config.key();
    blacklist.address = ctx.accounts.address.key();
    blacklist.bump = ctx.bumps.blacklist;

    emit!(AddressBlacklisted {
        hook_config: ctx.accounts.hook_config.key(),
        address: ctx.accounts.address.key(),
        blacklisted_by: ctx.accounts.authority.key(),
    });

    Ok(())
}
