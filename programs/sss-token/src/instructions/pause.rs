use anchor_lang::prelude::*;

use crate::state::StablecoinState;
use super::SssError;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.master_authority == authority.key() @ SssError::Unauthorized,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    ctx.accounts.stablecoin_state.paused = true;
    msg!("SSS: Stablecoin paused");
    Ok(())
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.master_authority == authority.key() @ SssError::Unauthorized,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
}

pub fn unpause_handler(ctx: Context<Unpause>) -> Result<()> {
    ctx.accounts.stablecoin_state.paused = false;
    msg!("SSS: Stablecoin unpaused");
    Ok(())
}
