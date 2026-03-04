use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::*;
use crate::utils::*;

// ========== PAUSE ==========

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(
        mut,
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", stablecoin_state.key().as_ref(), &[2u8], pauser.key().as_ref()],
        bump = role_account.bump,
        constraint = role_account.is_active @ StablecoinError::Unauthorized
    )]
    pub role_account: Account<'info, RoleAccount>,
    
    pub pauser: Signer<'info>,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    let stablecoin_state = &mut ctx.accounts.stablecoin_state;
    
    // Set paused
    stablecoin_state.is_paused = true;
    
    // Emit audit event
    emit_audit_event(
        "PAUSE",
        ctx.accounts.pauser.key(),
        stablecoin_state.key(),
        0,
        "Operations paused",
    );
    
    // Emit event
    emit!(OperationsPaused {
        mint: stablecoin_state.mint,
        pauser: ctx.accounts.pauser.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Operations paused");
    
    Ok(())
}

// ========== UNPAUSE ==========

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(
        mut,
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", stablecoin_state.key().as_ref(), &[2u8], pauser.key().as_ref()],
        bump = role_account.bump,
        constraint = role_account.is_active @ StablecoinError::Unauthorized
    )]
    pub role_account: Account<'info, RoleAccount>,
    
    pub pauser: Signer<'info>,
}

pub fn unpause_handler(ctx: Context<Unpause>) -> Result<()> {
    let stablecoin_state = &mut ctx.accounts.stablecoin_state;
    
    // Set unpaused
    stablecoin_state.is_paused = false;
    
    // Emit audit event
    emit_audit_event(
        "UNPAUSE",
        ctx.accounts.pauser.key(),
        stablecoin_state.key(),
        0,
        "Operations resumed",
    );
    
    // Emit event
    emit!(OperationsUnpaused {
        mint: stablecoin_state.mint,
        pauser: ctx.accounts.pauser.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Operations resumed");
    
    Ok(())
}

#[event]
pub struct OperationsPaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct OperationsUnpaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
    pub timestamp: i64,
}
