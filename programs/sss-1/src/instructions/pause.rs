use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    error::StablecoinError,
    events::{StablecoinPaused, StablecoinUnpaused},
    state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct Pause<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.admin == admin.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.paused = true;

    emit!(StablecoinPaused {
        config: config.key(),
        admin: ctx.accounts.admin.key(),
    });

    Ok(())
}

pub fn unpause_handler(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.paused = false;

    emit!(StablecoinUnpaused {
        config: config.key(),
        admin: ctx.accounts.admin.key(),
    });

    Ok(())
}
