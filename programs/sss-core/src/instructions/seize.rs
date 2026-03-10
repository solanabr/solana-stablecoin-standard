use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::error::SSSError;
use crate::events::TokensSeized;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct Seize<'info> {
    /// Only the authority can seize tokens.
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.authority @ SSSError::NotAuthority,
        constraint = config.preset >= PRESET_COMPLIANT @ SSSError::PresetFeatureUnavailable,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The target account to seize tokens from.
    #[account(
        mut,
        token::mint = mint,
    )]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Treasury or authority's token account to receive seized tokens.
    #[account(
        mut,
        token::mint = mint,
    )]
    pub destination_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Mint authority PDA acting as permanent delegate.
    /// CHECK: PDA validated by seeds.
    #[account(
        seeds = [MINT_AUTHORITY_SEED, mint.key().as_ref()],
        bump = config.mint_authority_bump,
    )]
    pub mint_authority: SystemAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handle_seize<'a>(ctx: Context<'_, '_, 'a, 'a, Seize<'a>>, amount: u64) -> Result<()> {
    // ── 1. VALIDATE ─────────────────────────────────────────────────────────
    require!(amount > 0, SSSError::ZeroAmount);

    // ── 2. EXECUTE CPI: transfer_checked using permanent delegate ───────────
    // NOTE: We build the CPI manually because anchor-spl's `transfer_checked`
    // ignores remaining_accounts, but Token-2022 needs them for the transfer hook.
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        MINT_AUTHORITY_SEED,
        mint_key.as_ref(),
        &[ctx.accounts.config.mint_authority_bump],
    ]];

    // Build transfer_checked instruction with all accounts including hook extras
    let mut ix = anchor_spl::token_2022::spl_token_2022::instruction::transfer_checked(
        ctx.accounts.token_program.key,
        &ctx.accounts.source_token_account.key(),
        &mint_key,
        &ctx.accounts.destination_token_account.key(),
        &ctx.accounts.mint_authority.key(),
        &[],
        amount,
        ctx.accounts.mint.decimals,
    )?;

    // Append remaining accounts (hook extra accounts) to the instruction
    for account_info in ctx.remaining_accounts.iter() {
        ix.accounts.push(AccountMeta {
            pubkey: *account_info.key,
            is_signer: account_info.is_signer,
            is_writable: account_info.is_writable,
        });
    }

    // Build the full account_infos list for invoke_signed
    let mut account_infos = vec![
        ctx.accounts.source_token_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.destination_token_account.to_account_info(),
        ctx.accounts.mint_authority.to_account_info(),
    ];
    for account_info in ctx.remaining_accounts.iter() {
        account_infos.push(account_info.to_account_info());
    }

    invoke_signed(&ix, &account_infos, signer_seeds)?;

    // ── 3. UPDATE STATE: Track seized amount for audit trail ─────────────
    let config = &mut ctx.accounts.config;
    config.total_seized = config
        .total_seized
        .checked_add(amount)
        .ok_or(SSSError::ArithmeticOverflow)?;

    // ── 4. EMIT EVENT ───────────────────────────────────────────────────────
    emit!(TokensSeized {
        config: ctx.accounts.config.key(),
        from_account: ctx.accounts.source_token_account.key(),
        to_account: ctx.accounts.destination_token_account.key(),
        amount,
        seized_by: ctx.accounts.authority.key(),
    });

    Ok(())
}
