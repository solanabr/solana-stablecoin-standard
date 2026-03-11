use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
    burn, Burn,
};

use crate::state::*;
use crate::errors::SSSError;
use crate::events::BurnEvent;

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        constraint = !config.is_paused @ SSSError::TokenPaused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"minter", mint.key().as_ref(), burner.key().as_ref()],
        bump = minter_allowance.bump,
        constraint = minter_allowance.is_active @ SSSError::MinterNotActive,
    )]
    pub minter_allowance: Account<'info, MinterAllowance>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = burner,
    )]
    pub burner_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;

    config.total_burned = config.total_burned
        .checked_add(amount)
        .ok_or(SSSError::ArithmeticOverflow)?;

    burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.burner_token_account.to_account_info(),
                authority: ctx.accounts.burner.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(BurnEvent {
        mint: ctx.accounts.mint.key(),
        burner: ctx.accounts.burner.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
