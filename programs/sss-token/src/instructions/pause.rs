use anchor_lang::prelude::*;

use crate::{
    error::StablecoinError,
    events::PauseChanged,
    state::{RoleEntry, RoleType, StablecoinConfig, CONFIG_SEED, ROLE_SEED},
};

// ─────────────────────────────────────────────────────────────────────────────
// Pause instruction
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct PauseCtx<'info> {
    /// Signer — must be master authority or hold Pauser role.
    pub authority: Signer<'info>,

    /// Config PDA to mutate.
    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Optional Pauser role PDA. Required when not master authority.
    #[account(
        seeds = [
            ROLE_SEED,
            config.mint.as_ref(),
            &[RoleType::Pauser as u8],
            authority.key().as_ref(),
        ],
        bump = pauser_role.bump,
        constraint = pauser_role.mint == config.mint @ StablecoinError::Unauthorized,
        constraint = pauser_role.address == authority.key() @ StablecoinError::Unauthorized,
        constraint = pauser_role.role == RoleType::Pauser @ StablecoinError::Unauthorized,
    )]
    pub pauser_role: Option<Account<'info, RoleEntry>>,
}

pub fn pause_handler(ctx: Context<PauseCtx>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let caller = ctx.accounts.authority.key();
    let is_master = caller == config.authority;

    if !is_master {
        let role = ctx
            .accounts
            .pauser_role
            .as_ref()
            .ok_or(StablecoinError::Unauthorized)?;
        require!(role.active, StablecoinError::RoleInactive);
    }

    config.paused = true;

    emit!(PauseChanged {
        mint: config.mint,
        paused: true,
        authority: caller,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Unpause instruction
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct UnpauseCtx<'info> {
    /// Signer — must be master authority or hold Pauser role.
    pub authority: Signer<'info>,

    /// Config PDA to mutate.
    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Optional Pauser role PDA. Required when not master authority.
    #[account(
        seeds = [
            ROLE_SEED,
            config.mint.as_ref(),
            &[RoleType::Pauser as u8],
            authority.key().as_ref(),
        ],
        bump = pauser_role.bump,
        constraint = pauser_role.mint == config.mint @ StablecoinError::Unauthorized,
        constraint = pauser_role.address == authority.key() @ StablecoinError::Unauthorized,
        constraint = pauser_role.role == RoleType::Pauser @ StablecoinError::Unauthorized,
    )]
    pub pauser_role: Option<Account<'info, RoleEntry>>,
}

pub fn unpause_handler(ctx: Context<UnpauseCtx>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let caller = ctx.accounts.authority.key();
    let is_master = caller == config.authority;

    if !is_master {
        let role = ctx
            .accounts
            .pauser_role
            .as_ref()
            .ok_or(StablecoinError::Unauthorized)?;
        require!(role.active, StablecoinError::RoleInactive);
    }

    config.paused = false;

    emit!(PauseChanged {
        mint: config.mint,
        paused: false,
        authority: caller,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
