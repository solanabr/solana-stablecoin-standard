use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SSSError;
use crate::events::Unpaused;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct Unpause<'info> {
    pub pauser: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = pauser.key() == config.pauser @ SSSError::NotPauser,
        constraint = config.paused @ SSSError::NotPaused,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handle_unpause(ctx: Context<Unpause>) -> Result<()> {
    ctx.accounts.config.paused = false;

    emit!(Unpaused {
        config: ctx.accounts.config.key(),
        unpaused_by: ctx.accounts.pauser.key(),
    });

    Ok(())
}
