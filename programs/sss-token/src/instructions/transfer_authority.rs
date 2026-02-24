use anchor_lang::prelude::*;

use crate::{
    errors::SssError,
    events::{AuthorityProposed, AuthorityTransferred},
    state::StablecoinState,
};

// ─── Step 1: Propose ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ProposeAuthority<'info> {
    pub current_authority: Signer<'info>,

    /// CHECK: The proposed new authority — just needs to be a valid pubkey
    pub proposed_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
        constraint = current_authority.key() == state.master_authority @ SssError::Unauthorized,
    )]
    pub state: Account<'info, StablecoinState>,
}

pub fn propose_handler(ctx: Context<ProposeAuthority>) -> Result<()> {
    let state = &mut ctx.accounts.state;
    state.pending_authority = Some(ctx.accounts.proposed_authority.key());

    emit!(AuthorityProposed {
        mint: state.mint,
        current: ctx.accounts.current_authority.key(),
        proposed: ctx.accounts.proposed_authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ─── Step 2: Accept ───────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    pub new_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
    )]
    pub state: Account<'info, StablecoinState>,
}

pub fn accept_handler(ctx: Context<AcceptAuthority>) -> Result<()> {
    let state = &mut ctx.accounts.state;

    let pending = state.pending_authority.ok_or(SssError::NoPendingAuthority)?;
    require!(
        ctx.accounts.new_authority.key() == pending,
        SssError::WrongPendingAuthority
    );

    let old_authority = state.master_authority;
    state.master_authority = pending;
    state.pending_authority = None;

    emit!(AuthorityTransferred {
        mint: state.mint,
        old_authority,
        new_authority: pending,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}