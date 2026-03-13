use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::state::{RoleManager, StablecoinConfig};

/// Accounts for the pause instruction.
#[derive(Accounts)]
pub struct Pause<'info> {
    /// The pauser signing the transaction.
    pub pauser: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager.
    #[account(
        seeds = [b"roles", config.key().as_ref()],
        bump = role_manager.bump,
        has_one = config,
    )]
    pub role_manager: Account<'info, RoleManager>,
}

/// Accounts for the unpause instruction.
#[derive(Accounts)]
pub struct Unpause<'info> {
    /// The authority signing the transaction.
    pub authority: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager.
    #[account(
        seeds = [b"roles", config.key().as_ref()],
        bump = role_manager.bump,
        has_one = config,
    )]
    pub role_manager: Account<'info, RoleManager>,
}

/// Event emitted when operations are paused.
#[event]
pub struct OperationsPaused {
    pub config: Pubkey,
    pub paused_by: Pubkey,
}

/// Event emitted when operations are unpaused.
#[event]
pub struct OperationsUnpaused {
    pub config: Pubkey,
    pub unpaused_by: Pubkey,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_manager = &ctx.accounts.role_manager;
    let pauser_key = ctx.accounts.pauser.key();

    // Check authorization: pauser or master authority
    require!(
        pauser_key == role_manager.pauser || pauser_key == role_manager.master_authority,
        SssError::UnauthorizedPauser
    );

    require!(!config.is_paused, SssError::Paused);

    config.is_paused = true;

    emit!(OperationsPaused {
        config: config.key(),
        paused_by: pauser_key,
    });

    Ok(())
}

pub fn unpause_handler(ctx: Context<Unpause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_manager = &ctx.accounts.role_manager;
    let authority_key = ctx.accounts.authority.key();

    // Only master authority can unpause
    require!(
        authority_key == role_manager.master_authority,
        SssError::UnauthorizedMasterAuthority
    );

    require!(config.is_paused, SssError::NotPaused);

    config.is_paused = false;

    emit!(OperationsUnpaused {
        config: config.key(),
        unpaused_by: authority_key,
    });

    Ok(())
}
