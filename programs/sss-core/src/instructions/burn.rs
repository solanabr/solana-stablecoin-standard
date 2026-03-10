use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Burn, Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::error::SSSError;
use crate::events::TokensBurned;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    /// The token holder burning their tokens.
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SSSError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token account to burn from. Must be owned by the burner.
    #[account(
        mut,
        token::mint = mint,
        token::authority = burner,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_burn(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    // ── 1. VALIDATE ─────────────────────────────────────────────────────────
    require!(amount > 0, SSSError::ZeroAmount);

    // ── 2. EXECUTE CPI: burn ────────────────────────────────────────────────
    token_interface::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.burner.to_account_info(),
            },
        ),
        amount,
    )?;

    // ── 3. UPDATE STATE ─────────────────────────────────────────────────────
    let config = &mut ctx.accounts.config;
    config.total_burned = config
        .total_burned
        .checked_add(amount)
        .ok_or(SSSError::ArithmeticOverflow)?;

    // ── 4. EMIT EVENT ───────────────────────────────────────────────────────
    emit!(TokensBurned {
        config: config.key(),
        burner: ctx.accounts.burner.key(),
        amount,
        total_burned: config.total_burned,
    });

    Ok(())
}
