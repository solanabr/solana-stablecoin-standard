use anchor_lang::prelude::*;
use crate::{
    constants::*,
    error::SssError,
    events::ContractPaused,
    state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct Pause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.has_pause_authority(&authority.key()) @ SssError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handler(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.paused = true;

    emit!(ContractPaused {
        mint: config.mint,
        by: ctx.accounts.authority.key(),
    });

    Ok(())
}
