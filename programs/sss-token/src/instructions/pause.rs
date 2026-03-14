use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::SssError;

pub fn pause_handler(ctx: Context<PauseUnpause>) -> Result<()> {
    let roles = &ctx.accounts.roles_config;
    require!(roles.is_pauser, SssError::Unauthorized);

    let config = &mut ctx.accounts.config;
    require!(!config.is_paused, SssError::AlreadyPaused);

    config.is_paused = true;
    msg!("Protocol paused");
    Ok(())
}

pub fn unpause_handler(ctx: Context<PauseUnpause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(config.is_paused, SssError::NotPaused);

    // only authority can unpause, not just any pauser
    require!(
        ctx.accounts.signer.key() == config.authority,
        SssError::Unauthorized
    );

    config.is_paused = false;
    msg!("Protocol unpaused");
    Ok(())
}

#[derive(Accounts)]
pub struct PauseUnpause<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"roles", config.key().as_ref(), signer.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,
}
