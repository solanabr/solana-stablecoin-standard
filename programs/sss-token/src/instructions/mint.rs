use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, MintTo, TokenInterface};

use crate::errors::SssError;
use crate::state::{RoleManager, StablecoinConfig};

/// Accounts for the mint instruction.
#[derive(Accounts)]
pub struct MintTokens<'info> {
    /// The minter signing the transaction.
    #[account(mut)]
    pub minter: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager.
    #[account(
        mut,
        seeds = [b"roles", config.key().as_ref()],
        bump = role_manager.bump,
        has_one = config,
    )]
    pub role_manager: Account<'info, RoleManager>,

    /// The Token-2022 mint.
    /// CHECK: Validated via config constraint.
    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: AccountInfo<'info>,

    /// The recipient's token account.
    /// CHECK: Validated by token program CPI.
    #[account(mut)]
    pub recipient_token_account: AccountInfo<'info>,

    /// Token-2022 program.
    pub token_program: Interface<'info, TokenInterface>,
}

/// Event emitted when tokens are minted.
#[event]
pub struct TokensMinted {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub total_minted: u64,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_manager = &mut ctx.accounts.role_manager;

    // Check not paused
    require!(!config.is_paused, SssError::Paused);

    // Check amount
    require!(amount > 0, SssError::ZeroMintAmount);

    // Check minter authorization and quota
    let minter_key = ctx.accounts.minter.key();
    let minter_entry = role_manager
        .find_minter_mut(&minter_key)
        .ok_or(SssError::UnauthorizedMinter)?;

    require!(
        minter_entry.remaining_quota() >= amount,
        SssError::MinterQuotaExceeded
    );

    // Update minter's minted amount
    minter_entry.minted = minter_entry
        .minted
        .checked_add(amount)
        .ok_or(SssError::ArithmeticOverflow)?;

    // Update total minted
    config.total_minted = config
        .total_minted
        .checked_add(amount)
        .ok_or(SssError::ArithmeticOverflow)?;

    // CPI: Mint tokens
    let config_key = config.mint;
    let bump = config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"config", config_key.as_ref(), &[bump]]];

    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: config.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );

    token_interface::mint_to(cpi_ctx, amount)?;

    emit!(TokensMinted {
        config: config.key(),
        mint: config.mint,
        minter: minter_key,
        recipient: ctx.accounts.recipient_token_account.key(),
        amount,
        total_minted: config.total_minted,
    });

    Ok(())
}
