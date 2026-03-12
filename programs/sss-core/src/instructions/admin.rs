use anchor_lang::prelude::*;

use crate::{
    constants::STABLECOIN_SEED,
    error::SssError,
    events::{AuthorityTransferred, StablecoinPaused, StablecoinUnpaused},
    state::{RoleKind, StablecoinState},
};

#[derive(Accounts)]
pub struct Pause<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
}

pub fn pause(ctx: Context<Pause>) -> Result<()> {
    let state = &mut ctx.accounts.stablecoin_state;
    let caller = ctx.accounts.caller.key();
    require!(
        state.authority == caller || state.has_role(&caller, &RoleKind::Pauser),
        SssError::Unauthorized
    );

    state.paused = true;

    emit!(StablecoinPaused {
        mint: state.mint,
        pauser: caller,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

pub fn unpause(ctx: Context<Pause>) -> Result<()> {
    let state = &mut ctx.accounts.stablecoin_state;
    let caller = ctx.accounts.caller.key();
    require!(
        state.authority == caller || state.has_role(&caller, &RoleKind::Pauser),
        SssError::Unauthorized
    );

    state.paused = false;

    emit!(StablecoinUnpaused {
        mint: state.mint,
        pauser: caller,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.authority == authority.key() @ SssError::Unauthorized,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
}

pub fn transfer_authority(
    ctx: Context<TransferAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let state = &mut ctx.accounts.stablecoin_state;
    let old = state.authority;
    state.authority = new_authority;

    emit!(AuthorityTransferred {
        mint: state.mint,
        old_authority: old,
        new_authority,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
