use anchor_lang::prelude::*;

use crate::{errors::SssError, events::ProtocolUnpaused, state::StablecoinState};

#[derive(Accounts)]
pub struct Unpause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
    )]
    pub state: Account<'info, StablecoinState>,
}

pub fn handler(ctx: Context<Unpause>) -> Result<()> {
    let authority_key = ctx.accounts.authority.key();
    let state = &mut ctx.accounts.state;

    let is_authorized = state.pauser.map_or(false, |p| p == authority_key);

    require!(is_authorized, SssError::Unauthorized);
    state.paused = false;

    #[cfg(not(feature = "trident-fuzz"))]
    emit!(ProtocolUnpaused {
        mint: state.mint,
        pauser: authority_key,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}