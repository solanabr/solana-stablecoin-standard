use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::error::SSSError;
use crate::events::TokensMinted;
use crate::state::{MinterState, StablecoinConfig};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    /// The authorized minter.
    pub minter: Signer<'info>,

    /// Stablecoin config. Must not be paused.
    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SSSError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Minter's state. Must be enabled and match signer.
    #[account(
        mut,
        seeds = [MINTER_SEED, config.key().as_ref(), minter.key().as_ref()],
        bump = minter_state.bump,
        constraint = minter_state.enabled @ SSSError::MinterDisabled,
        constraint = minter_state.config == config.key(),
    )]
    pub minter_state: Account<'info, MinterState>,

    /// The stablecoin mint.
    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Destination token account to receive minted tokens.
    #[account(
        mut,
        token::mint = mint,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    /// Mint authority PDA.
    /// CHECK: PDA validated by seeds. Signs the mint_to CPI.
    #[account(
        seeds = [MINT_AUTHORITY_SEED, mint.key().as_ref()],
        bump = config.mint_authority_bump,
    )]
    pub mint_authority: SystemAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_mint(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    // ── 1. VALIDATE ─────────────────────────────────────────────────────────
    require!(amount > 0, SSSError::ZeroAmount);

    // ── 2. READ STATE & SAFETY CHECK ────────────────────────────────────────
    let remaining = ctx
        .accounts
        .minter_state
        .quota
        .checked_sub(ctx.accounts.minter_state.minted_amount)
        .ok_or(SSSError::ArithmeticOverflow)?;

    require!(amount <= remaining, SSSError::QuotaExceeded);

    // ── 3. EXECUTE CPI: mint_to ─────────────────────────────────────────────
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        MINT_AUTHORITY_SEED,
        mint_key.as_ref(),
        &[ctx.accounts.config.mint_authority_bump],
    ]];

    token_interface::mint_to(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
        )
        .with_signer(signer_seeds),
        amount,
    )?;

    // ── 4. UPDATE STATE ─────────────────────────────────────────────────────
    let minter_state = &mut ctx.accounts.minter_state;
    minter_state.minted_amount = minter_state
        .minted_amount
        .checked_add(amount)
        .ok_or(SSSError::ArithmeticOverflow)?;

    let config = &mut ctx.accounts.config;
    config.total_minted = config
        .total_minted
        .checked_add(amount)
        .ok_or(SSSError::ArithmeticOverflow)?;

    // ── 5. EMIT EVENT ───────────────────────────────────────────────────────
    emit!(TokensMinted {
        config: config.key(),
        minter: ctx.accounts.minter.key(),
        destination: ctx.accounts.destination.key(),
        amount,
        remaining_quota: minter_state
            .quota
            .saturating_sub(minter_state.minted_amount),
    });

    Ok(())
}
