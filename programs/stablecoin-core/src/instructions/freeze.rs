use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, FreezeAccount as FreezeAccountCPI, ThawAccount as ThawAccountCPI};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::state::*;
use crate::errors::*;
use crate::utils::*;

// ========== FREEZE ACCOUNT ==========

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    #[account(
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        has_one = mint,
        constraint = stablecoin_state.master_authority == authority.key() @ StablecoinError::Unauthorized
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

pub fn freeze_handler(ctx: Context<FreezeAccount>) -> Result<()> {
    let stablecoin_state = &ctx.accounts.stablecoin_state;
    
    // Check if paused
    require!(!stablecoin_state.is_paused, StablecoinError::Paused);
    
    // Freeze account
    let seeds = &[
        b"stablecoin",
        stablecoin_state.mint.as_ref(),
        &[stablecoin_state.bump],
    ];
    let signer = &[&seeds[..]];
    
    let cpi_accounts = FreezeAccountCPI {
        account: ctx.accounts.token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: stablecoin_state.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    
    token_2022::freeze_account(cpi_ctx)?;
    
    // Emit audit event
    emit_audit_event(
        "FREEZE",
        ctx.accounts.authority.key(),
        ctx.accounts.token_account.key(),
        0,
        "Account frozen",
    );
    
    // Emit event
    emit!(AccountFrozen {
        mint: stablecoin_state.mint,
        account: ctx.accounts.token_account.key(),
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Frozen account: {}", ctx.accounts.token_account.key());
    
    Ok(())
}

// ========== THAW ACCOUNT ==========

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    #[account(
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        has_one = mint,
        constraint = stablecoin_state.master_authority == authority.key() @ StablecoinError::Unauthorized
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

pub fn thaw_handler(ctx: Context<ThawAccount>) -> Result<()> {
    let stablecoin_state = &ctx.accounts.stablecoin_state;
    
    // Check if paused
    require!(!stablecoin_state.is_paused, StablecoinError::Paused);
    
    // Thaw account
    let seeds = &[
        b"stablecoin",
        stablecoin_state.mint.as_ref(),
        &[stablecoin_state.bump],
    ];
    let signer = &[&seeds[..]];
    
    let cpi_accounts = ThawAccountCPI {
        account: ctx.accounts.token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: stablecoin_state.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    
    token_2022::thaw_account(cpi_ctx)?;
    
    // Emit audit event
    emit_audit_event(
        "THAW",
        ctx.accounts.authority.key(),
        ctx.accounts.token_account.key(),
        0,
        "Account thawed",
    );
    
    // Emit event
    emit!(AccountThawed {
        mint: stablecoin_state.mint,
        account: ctx.accounts.token_account.key(),
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Thawed account: {}", ctx.accounts.token_account.key());
    
    Ok(())
}

#[event]
pub struct AccountFrozen {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AccountThawed {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}
