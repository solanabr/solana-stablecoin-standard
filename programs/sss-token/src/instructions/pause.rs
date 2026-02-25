use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::SSSError,
    events::{TokenPaused, TokenUnpaused},
    state::{RoleManager, StablecoinConfig},
};

#[derive(Accounts)]
pub struct PauseUnpause<'info> {
    pub pauser: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref()],
        bump = role_manager.bump,
    )]
    pub role_manager: Account<'info, RoleManager>,
}

pub fn pause_handler(ctx: Context<PauseUnpause>) -> Result<()> {
    let config = &ctx.accounts.stablecoin_config;
    let roles = &ctx.accounts.role_manager;
    let signer_key = ctx.accounts.pauser.key();
    let mint_key = config.mint;

    require!(
        config.authority == signer_key || roles.pausers.contains(&signer_key),
        SSSError::Unauthorized
    );

    let config = &mut ctx.accounts.stablecoin_config;
    config.paused = true;

    emit!(TokenPaused {
        mint: mint_key,
        by: signer_key,
    });

    Ok(())
}

pub fn unpause_handler(ctx: Context<PauseUnpause>) -> Result<()> {
    let config = &ctx.accounts.stablecoin_config;
    let roles = &ctx.accounts.role_manager;
    let signer_key = ctx.accounts.pauser.key();
    let mint_key = config.mint;

    require!(
        config.authority == signer_key || roles.pausers.contains(&signer_key),
        SSSError::Unauthorized
    );

    let config = &mut ctx.accounts.stablecoin_config;
    config.paused = false;

    emit!(TokenUnpaused {
        mint: mint_key,
        by: signer_key,
    });

    Ok(())
}
