use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, Burn as BurnToken};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::state::*;
use crate::errors::*;
use crate::utils::*;

#[derive(Accounts)]
pub struct Burn<'info> {
    #[account(
        mut,
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        has_one = mint
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", stablecoin_state.key().as_ref(), &[0u8], burner.key().as_ref()],
        bump = role_account.bump,
        constraint = role_account.is_active @ StablecoinError::Unauthorized
    )]
    pub role_account: Account<'info, RoleAccount>,
    
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub burner: Signer<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Burn>, amount: u64) -> Result<()> {
    let stablecoin_state = &mut ctx.accounts.stablecoin_state;
    
    // Validate amount
    validate_amount(amount)?;
    
    // Check if paused
    require!(!stablecoin_state.is_paused, StablecoinError::Paused);
    
    // Burn tokens
    let cpi_accounts = BurnToken {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.token_account.to_account_info(),
        authority: ctx.accounts.burner.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token_2022::burn(cpi_ctx, amount)?;
    
    // Update state
    stablecoin_state.total_burned = safe_add(stablecoin_state.total_burned, amount)?;
    
    // Emit audit event
    emit_audit_event(
        "BURN",
        ctx.accounts.burner.key(),
        ctx.accounts.token_account.key(),
        amount,
        &format!("Burned {} tokens", amount),
    );
    
    // Emit event
    emit!(TokensBurned {
        mint: stablecoin_state.mint,
        from: ctx.accounts.token_account.key(),
        amount,
        burner: ctx.accounts.burner.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Burned {} tokens from {}", amount, ctx.accounts.token_account.key());
    
    Ok(())
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub burner: Pubkey,
    pub timestamp: i64,
}
