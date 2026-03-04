use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::state::*;
use crate::errors::*;
use crate::utils::*;

#[derive(Accounts)]
pub struct Seize<'info> {
    #[account(
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        has_one = mint,
        constraint = stablecoin_state.compliance_enabled @ StablecoinError::ComplianceNotEnabled,
        constraint = stablecoin_state.permanent_delegate_enabled @ StablecoinError::PermanentDelegateNotEnabled
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", stablecoin_state.key().as_ref(), &[3u8], seizer.key().as_ref()],
        bump = role_account.bump,
        constraint = role_account.is_active @ StablecoinError::Unauthorized
    )]
    pub role_account: Account<'info, RoleAccount>,
    
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    
    #[account(
        mut,
        constraint = from_account.is_frozen() @ StablecoinError::AccountNotFrozen
    )]
    pub from_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub to_account: InterfaceAccount<'info, TokenAccount>,
    
    pub seizer: Signer<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Seize>, amount: u64) -> Result<()> {
    let stablecoin_state = &ctx.accounts.stablecoin_state;
    
    // Validate amount
    validate_amount(amount)?;
    
    // Check if paused
    require!(!stablecoin_state.is_paused, StablecoinError::Paused);
    
    // Seize tokens using permanent delegate authority
    let seeds = &[
        b"stablecoin",
        stablecoin_state.mint.as_ref(),
        &[stablecoin_state.bump],
    ];
    let signer = &[&seeds[..]];
    
    // Transfer using permanent delegate
    let transfer_ix = spl_token_2022::instruction::transfer_checked(
        ctx.accounts.token_program.key,
        &ctx.accounts.from_account.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.to_account.key(),
        &stablecoin_state.key(),
        &[],
        amount,
        ctx.accounts.mint.decimals,
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.from_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.to_account.to_account_info(),
            stablecoin_state.to_account_info(),
        ],
        signer,
    )?;
    
    // Emit audit event
    emit_audit_event(
        "SEIZE",
        ctx.accounts.seizer.key(),
        ctx.accounts.from_account.key(),
        amount,
        &format!("Seized {} tokens to {}", amount, ctx.accounts.to_account.key()),
    );
    
    // Emit event
    emit!(TokensSeized {
        mint: stablecoin_state.mint,
        from: ctx.accounts.from_account.key(),
        to: ctx.accounts.to_account.key(),
        amount,
        seizer: ctx.accounts.seizer.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!(
        "Seized {} tokens from {} to {}",
        amount,
        ctx.accounts.from_account.key(),
        ctx.accounts.to_account.key()
    );
    
    Ok(())
}

#[event]
pub struct TokensSeized {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub seizer: Pubkey,
    pub timestamp: i64,
}
