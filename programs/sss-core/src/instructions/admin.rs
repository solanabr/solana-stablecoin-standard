use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::{
    StablecoinPaused, StablecoinUnpaused, AuthorityTransferred,
    AuthorityProposed, AuthorityTransferCancelled,
};
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(
        constraint = authority.key() == config.authority @ StablecoinError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn pause_handler(ctx: Context<AdminAction>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(!config.paused, StablecoinError::AlreadyPaused);
    config.paused = true;

    emit!(StablecoinPaused {
        config: config.key(),
        pauser: ctx.accounts.authority.key(),
    });

    Ok(())
}

pub fn unpause_handler(ctx: Context<AdminAction>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(config.paused, StablecoinError::NotPaused);
    config.paused = false;

    emit!(StablecoinUnpaused {
        config: config.key(),
        pauser: ctx.accounts.authority.key(),
    });

    Ok(())
}

/// Step 1 of two-step authority transfer: propose a new authority.
pub fn propose_authority_handler(
    ctx: Context<AdminAction>,
    new_authority: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.pending_authority = new_authority;

    emit!(AuthorityProposed {
        config: config.key(),
        current_authority: ctx.accounts.authority.key(),
        proposed_authority: new_authority,
    });

    Ok(())
}

/// Cancel a pending authority transfer proposal.
pub fn cancel_authority_transfer_handler(ctx: Context<AdminAction>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(
        config.pending_authority != Pubkey::default(),
        StablecoinError::NoPendingAuthority
    );
    config.pending_authority = Pubkey::default();

    emit!(AuthorityTransferCancelled {
        config: config.key(),
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}

/// Step 2 of two-step authority transfer: the proposed authority accepts.
#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(
        constraint = new_authority.key() == config.pending_authority @ StablecoinError::Unauthorized,
        constraint = config.pending_authority != Pubkey::default() @ StablecoinError::NoPendingAuthority,
    )]
    pub new_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn accept_authority_handler(ctx: Context<AcceptAuthority>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let previous_authority = config.authority;
    config.authority = config.pending_authority;
    config.pending_authority = Pubkey::default();

    emit!(AuthorityTransferred {
        config: config.key(),
        previous_authority,
        new_authority: config.authority,
    });

    Ok(())
}

/// Single-step authority transfer (immediate, no acceptance needed).
/// Use with care — no protection against typos.
#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(
        constraint = authority.key() == config.authority @ StablecoinError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn transfer_authority_handler(
    ctx: Context<TransferAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let previous_authority = config.authority;
    config.authority = new_authority;
    config.pending_authority = Pubkey::default();

    emit!(AuthorityTransferred {
        config: config.key(),
        previous_authority,
        new_authority,
    });

    Ok(())
}
