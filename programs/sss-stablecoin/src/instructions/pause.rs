//! Pause and unpause instructions for emergency control

use crate::{
    constants::CONFIG_SEED,
    error::StablecoinError,
    events::{Paused, Unpaused},
    state::StablecoinConfig,
};
use anchor_lang::prelude::*;

/// Pause all operations
pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(
        is_pauser(config, &ctx.accounts.authority.key()),
        StablecoinError::Unauthorized
    );
    config.paused = true;

    emit!(Paused {
        mint: config.mint,
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}

/// Unpause operations
pub fn unpause_handler(ctx: Context<Unpause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(
        is_pauser(config, &ctx.accounts.authority.key()),
        StablecoinError::Unauthorized
    );
    config.paused = false;

    emit!(Unpaused {
        mint: config.mint,
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}

fn is_pauser(config: &StablecoinConfig, signer: &Pubkey) -> bool {
    *signer == config.master_authority || *signer == config.pauser
}

#[derive(Accounts)]
pub struct Pause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for PDA seed relation.
    pub mint: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for PDA seed relation.
    pub mint: UncheckedAccount<'info>,
}
