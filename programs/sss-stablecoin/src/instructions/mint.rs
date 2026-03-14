//! Mint instruction for creating new tokens

use crate::{
    compliance,
    constants::{CONFIG_SEED, MINTER_ROLE_SEED},
    error::StablecoinError,
    events::Minted,
    math::compute_quota_update,
    state::{MinterRole, StablecoinConfig},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    mint_to, Mint as TokenMint, MintTo as TokenMintTo, Token2022, TokenAccount,
};

/// Mint new tokens to a recipient
pub fn handler(ctx: Context<Mint>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, StablecoinError::Paused);
    require_keys_eq!(
        config.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );
    require_keys_eq!(
        ctx.accounts.recipient.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidTokenAccount
    );

    let signer = ctx.accounts.authority.key();
    let minter_role = &mut ctx.accounts.minter_role;
    require!(minter_role.active, StablecoinError::Unauthorized);
    require_keys_eq!(minter_role.authority, signer, StablecoinError::Unauthorized);

    // Update quota
    update_quota(minter_role, amount)?;

    // Compliance check for SSS-2
    if config.compliance_enabled {
        compliance::validate_not_blacklisted(
            &ctx.accounts.recipient_compliance_record,
            &ctx.accounts.recipient.owner,
            &ctx.accounts.mint.key(),
        )?;
    }

    // Mint tokens
    let mint_key = ctx.accounts.mint.key();
    let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
    let signer_seeds: &[&[&[u8]]] = &[config_seeds];

    let cpi_accounts = TokenMintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.recipient.to_account_info(),
        authority: ctx.accounts.config.to_account_info(),
    };
    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        ),
        amount,
    )?;

    emit!(Minted {
        mint: ctx.accounts.mint.key(),
        to: ctx.accounts.recipient.key(),
        minter: signer,
        amount,
        quota_used: minter_role.minted_in_window,
        quota_limit: minter_role.quota_amount,
    });

    Ok(())
}

fn update_quota(minter_role: &mut Account<MinterRole>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let (window_start_ts, minted_in_window) = compute_quota_update(
        now,
        minter_role.window_start_ts,
        minter_role.window_seconds,
        minter_role.minted_in_window,
        minter_role.quota_amount,
        amount,
    )?;
    minter_role.window_start_ts = window_start_ts;
    minter_role.minted_in_window = minted_in_window;
    Ok(())
}

#[derive(Accounts)]
pub struct Mint<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub recipient: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [MINTER_ROLE_SEED, config.key().as_ref(), authority.key().as_ref()],
        bump = minter_role.bump
    )]
    pub minter_role: Account<'info, MinterRole>,

    /// CHECK: validated when compliance mode is enabled.
    pub recipient_compliance_record: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}
