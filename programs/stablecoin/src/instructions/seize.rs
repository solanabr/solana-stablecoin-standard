use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use anchor_spl::token_interface::spl_token_2022;

use crate::error::StablecoinError;
use crate::events::TokensSeized;
use crate::state::*;

#[derive(Accounts)]
pub struct Seize<'info> {
    /// The seizer authority.
    pub seizer: Signer<'info>,

    /// Role configuration — validates the seizer role.
    #[account(
        seeds = [RoleConfig::SEED_PREFIX, config.key().as_ref()],
        bump = roles.bump,
        constraint = roles.seizer == seizer.key() @ StablecoinError::Unauthorized,
    )]
    pub roles: Account<'info, RoleConfig>,

    /// The stablecoin configuration.
    /// Note: seize is intentionally allowed while paused — it is an emergency enforcement
    /// action (OFAC compliance, incident response) that must remain available even when
    /// normal operations are halted.
    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX, mint.key().as_ref()],
        bump = config.bump,
        constraint = config.is_compliance_enabled() @ StablecoinError::ComplianceNotEnabled,
    )]
    pub config: Box<Account<'info, StablecoinConfig>>,

    /// The stablecoin mint (mutable for burn + mint operations).
    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// The source token account to seize tokens from.
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub from_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The treasury/destination token account to receive seized tokens.
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub to_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<Seize>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::InvalidAmount);
    require!(
        ctx.accounts.config.enable_permanent_delegate,
        StablecoinError::ComplianceNotEnabled
    );

    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        StablecoinConfig::SEED_PREFIX,
        mint_key.as_ref(),
        &[ctx.accounts.config.bump],
    ]];

    // Seize uses burn + mint instead of transfer_checked to avoid
    // triggering the transfer hook (which would reject blacklisted accounts).
    // The permanent delegate has authority to burn from any account,
    // and the config PDA is the mint authority.

    // Step 1: Burn tokens from the source account using permanent delegate.
    invoke_signed(
        &spl_token_2022::instruction::burn_checked(
            &spl_token_2022::ID,
            &ctx.accounts.from_token_account.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.config.key(), // permanent delegate
            &[],
            amount,
            ctx.accounts.config.decimals,
        )?,
        &[
            ctx.accounts.from_token_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Step 2: Mint equivalent tokens to the treasury using mint authority.
    // Use mint_checked (not mint_to) to enforce the decimals invariant.
    invoke_signed(
        &spl_token_2022::instruction::mint_to_checked(
            &spl_token_2022::ID,
            &ctx.accounts.mint.key(),
            &ctx.accounts.to_token_account.key(),
            &ctx.accounts.config.key(), // mint authority
            &[],
            amount,
            ctx.accounts.config.decimals,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.to_token_account.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Update global supply accounting (burn + mint are net-neutral for circulating
    // supply, but we track both counters for auditability).
    let config = &mut ctx.accounts.config;
    config.total_burned = config
        .total_burned
        .checked_add(amount)
        .ok_or(StablecoinError::Overflow)?;
    config.total_minted = config
        .total_minted
        .checked_add(amount)
        .ok_or(StablecoinError::Overflow)?;

    emit!(TokensSeized {
        config: ctx.accounts.config.key(),
        from: ctx.accounts.from_token_account.key(),
        to: ctx.accounts.to_token_account.key(),
        amount,
        seized_by: ctx.accounts.seizer.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
