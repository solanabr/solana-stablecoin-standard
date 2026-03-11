use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
    mint_to, MintTo,
};

use crate::state::*;
use crate::errors::SSSError;
use crate::events::MintEvent;

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        constraint = !config.is_paused @ SSSError::TokenPaused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [b"minter", mint.key().as_ref(), minter.key().as_ref()],
        bump = minter_allowance.bump,
        constraint = minter_allowance.is_active @ SSSError::MinterNotActive,
    )]
    pub minter_allowance: Account<'info, MinterAllowance>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: PDA mint authority
    #[account(
        seeds = [b"authority", mint.key().as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    let minter_allowance = &mut ctx.accounts.minter_allowance;
    let config = &mut ctx.accounts.config;

    // Check allowance
    require!(amount <= minter_allowance.allowance, SSSError::AllowanceExceeded);

    // Decrement allowance
    minter_allowance.allowance = minter_allowance.allowance
        .checked_sub(amount)
        .ok_or(SSSError::ArithmeticOverflow)?;

    // Increment tracking
    minter_allowance.total_minted = minter_allowance.total_minted
        .checked_add(amount)
        .ok_or(SSSError::ArithmeticOverflow)?;

    config.total_minted = config.total_minted
        .checked_add(amount)
        .ok_or(SSSError::ArithmeticOverflow)?;

    // CPI to Token-2022 mint_to
    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.bumps.mint_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[b"authority", mint_key.as_ref(), &[bump]]];

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    emit!(MintEvent {
        mint: ctx.accounts.mint.key(),
        minter: ctx.accounts.minter.key(),
        recipient: ctx.accounts.recipient_token_account.key(),
        amount,
        remaining_allowance: minter_allowance.allowance,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
