use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::SSSError;
use crate::events::PauseEvent;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub pauser: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
        constraint = config.pauser == pauser.key() @ SSSError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.is_paused = true;

    emit!(PauseEvent {
        mint: config.mint,
        is_paused: true,
        by: ctx.accounts.pauser.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    pub pauser: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
        constraint = config.pauser == pauser.key() @ SSSError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn unpause_handler(ctx: Context<Unpause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.is_paused = false;

    emit!(PauseEvent {
        mint: config.mint,
        is_paused: false,
        by: ctx.accounts.pauser.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
