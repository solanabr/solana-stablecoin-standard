use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SssError;
use crate::state::*;

#[derive(Accounts)]
pub struct PauseUnpause<'info> {
    pub authority: Signer<'info>,

    /// CHECK: used as seed only
    pub mint: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,
}

pub fn pause_handler(ctx: Context<PauseUnpause>) -> Result<()> {
    let caller = ctx.accounts.authority.key();
    let roles = &ctx.accounts.roles_config;
    require!(
        caller == roles.master_authority || caller == roles.pauser,
        SssError::Unauthorized
    );

    ctx.accounts.stablecoin_config.paused = true;
    msg!("Token paused: {}", ctx.accounts.mint.key());
    Ok(())
}

pub fn unpause_handler(ctx: Context<PauseUnpause>) -> Result<()> {
    let caller = ctx.accounts.authority.key();
    let roles = &ctx.accounts.roles_config;
    require!(
        caller == roles.master_authority || caller == roles.pauser,
        SssError::Unauthorized
    );

    ctx.accounts.stablecoin_config.paused = false;
    msg!("Token unpaused: {}", ctx.accounts.mint.key());
    Ok(())
}
