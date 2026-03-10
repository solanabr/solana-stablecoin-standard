use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SSSError;
use crate::events::Paused;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub pauser: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = pauser.key() == config.pauser @ SSSError::NotPauser,
        constraint = !config.paused @ SSSError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handle_pause(ctx: Context<Pause>) -> Result<()> {
    ctx.accounts.config.paused = true;

    emit!(Paused {
        config: ctx.accounts.config.key(),
        paused_by: ctx.accounts.pauser.key(),
    });

    Ok(())
}
