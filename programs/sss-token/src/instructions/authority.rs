use anchor_lang::prelude::*;

use crate::{
    error::StablecoinError,
    events::{AuthorityNominated, AuthorityTransferred},
    state::{StablecoinConfig, CONFIG_SEED},
};

// ─────────────────────────────────────────────────────────────────────────────
// NominateAuthority — Step 1 of two-step authority transfer
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct NominateAuthorityCtx<'info> {
    /// Current master authority.
    pub authority: Signer<'info>,

    /// Config PDA to mutate.
    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn nominate_authority_handler(
    ctx: Context<NominateAuthorityCtx>,
    new_authority: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    // Prevent overwriting an already-pending nomination — the current
    // authority must cancel (or wait for acceptance) before nominating again.
    require!(
        config.pending_authority.is_none(),
        StablecoinError::PendingAuthorityExists
    );

    config.pending_authority = Some(new_authority);

    emit!(AuthorityNominated {
        mint: config.mint,
        current: config.authority,
        nominee: new_authority,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// AcceptAuthority — Step 2 of two-step authority transfer
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct AcceptAuthorityCtx<'info> {
    /// The nominated new authority — MUST sign.
    pub new_authority: Signer<'info>,

    /// Config PDA to mutate.
    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        // Ensure the signer matches exactly the pending nominee.
        constraint = config.pending_authority == Some(new_authority.key()) @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn accept_authority_handler(ctx: Context<AcceptAuthorityCtx>) -> Result<()> {
    let config = &mut ctx.accounts.config;

    // Defensive: ensure there is actually a pending authority (constraint
    // above already catches the wrong-signer case, but belt-and-suspenders).
    require!(
        config.pending_authority.is_some(),
        StablecoinError::NoPendingAuthority
    );

    let old_authority = config.authority;
    let new_authority = ctx.accounts.new_authority.key();

    config.authority = new_authority;
    config.pending_authority = None;

    emit!(AuthorityTransferred {
        mint: config.mint,
        old_authority,
        new_authority,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
