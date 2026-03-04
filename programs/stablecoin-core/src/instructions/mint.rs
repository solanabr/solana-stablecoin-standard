use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, MintTo};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::state::*;
use crate::errors::*;
use crate::utils::*;

#[derive(Accounts)]
pub struct Mint<'info> {
    #[account(
        mut,
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        has_one = mint
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        mut,
        seeds = [b"minter", stablecoin_state.key().as_ref(), minter.key().as_ref()],
        bump = minter_account.bump,
        constraint = minter_account.is_active @ StablecoinError::MinterInactive
    )]
    pub minter_account: Account<'info, MinterAccount>,
    
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub minter: Signer<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Mint>, amount: u64) -> Result<()> {
    let stablecoin_state = &mut ctx.accounts.stablecoin_state;
    let minter_account = &mut ctx.accounts.minter_account;
    
    // Validate amount
    validate_amount(amount)?;
    
    // Check if paused
    require!(!stablecoin_state.is_paused, StablecoinError::Paused);
    
    // Check minter quota
    let current_day = get_current_day();
    require!(
        minter_account.can_mint(amount, current_day),
        StablecoinError::QuotaExceeded
    );
    
    // Mint tokens
    let seeds = &[
        b"stablecoin",
        stablecoin_state.mint.as_ref(),
        &[stablecoin_state.bump],
    ];
    let signer = &[&seeds[..]];
    
    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: stablecoin_state.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    
    token_2022::mint_to(cpi_ctx, amount)?;
    
    // Update state
    stablecoin_state.total_minted = safe_add(stablecoin_state.total_minted, amount)?;
    minter_account.record_mint(amount, current_day);
    
    // Emit audit event
    emit_audit_event(
        "MINT",
        ctx.accounts.minter.key(),
        ctx.accounts.recipient_token_account.key(),
        amount,
        &format!("Minted {} tokens", amount),
    );
    
    // Emit event
    emit!(TokensMinted {
        mint: stablecoin_state.mint,
        recipient: ctx.accounts.recipient_token_account.key(),
        amount,
        minter: ctx.accounts.minter.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Minted {} tokens to {}", amount, ctx.accounts.recipient_token_account.key());
    
    Ok(())
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub minter: Pubkey,
    pub timestamp: i64,
}
