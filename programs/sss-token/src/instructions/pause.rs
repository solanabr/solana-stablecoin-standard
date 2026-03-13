use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SSSError;
use crate::events::{StablecoinPaused, StablecoinUnpaused};
use crate::state::*;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub pauser: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref(), pauser.key().as_ref()],
        bump = pauser_roles.bump,
        constraint = pauser_roles.roles & Role::PAUSER != 0 @ SSSError::Unauthorized,
    )]
    pub pauser_roles: Account<'info, RoleAccount>,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.stablecoin_config;
    require!(!config.paused, SSSError::Paused);
    config.paused = true;

    let clock = Clock::get()?;
    emit!(StablecoinPaused {
        mint: config.mint,
        authority: ctx.accounts.pauser.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

pub fn unpause_handler(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.stablecoin_config;
    require!(config.paused, SSSError::NotPaused);
    config.paused = false;

    let clock = Clock::get()?;
    emit!(StablecoinUnpaused {
        mint: config.mint,
        authority: ctx.accounts.pauser.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
