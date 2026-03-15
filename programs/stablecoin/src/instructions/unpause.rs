use anchor_lang::prelude::*;

use crate::errors::StablecoinError;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(
        constraint = authority.key() == config.authority @ StablecoinError::NotMasterAuthority,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin-config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handler(ctx: Context<Unpause>) -> Result<()> {
    require!(ctx.accounts.config.paused, StablecoinError::NotPaused);

    let config = &mut ctx.accounts.config;
    config.paused = false;
    config.updated_at = Clock::get()?.slot;

    msg!("Stablecoin unpaused by {}", ctx.accounts.authority.key());
    Ok(())
}
