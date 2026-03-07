use anchor_lang::prelude::*;
use crate::{
    constants::*,
    error::SssError,
    events::ContractUnpaused,
    state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct Unpause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.has_pause_authority(&authority.key()) @ SssError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handler(ctx: Context<Unpause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.paused = false;

    emit!(ContractUnpaused {
        mint: config.mint,
        by: ctx.accounts.authority.key(),
    });

    Ok(())
}
