use anchor_lang::prelude::*;
use anchor_spl::token_2022::{mint_to, MintTo, Token2022};
use anchor_spl::token_interface::{Mint as MintInterface, TokenAccount};

use crate::errors::StablecoinError;
use crate::events::*;
use crate::state::{RoleRegistry, StablecoinConfig};

#[derive(Accounts)]
pub struct Mint<'info> {
    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX.as_bytes(), config.authority.as_ref(), config.symbol.as_bytes()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        mut,
        seeds = [RoleRegistry::SEED_PREFIX.as_bytes(), config.key().as_ref()],
        bump = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,
    #[account(mut, constraint = mint.key() == config.mint)]
    pub mint: InterfaceAccount<'info, MintInterface>,
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub recipient_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub minter: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
}

pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    let minter = ctx.accounts.minter.key();

    require!(!config.paused, StablecoinError::Paused);
    require!(amount > 0, StablecoinError::ZeroAmount);

    let minter_entry = ctx
        .accounts
        .role_registry
        .minters
        .iter()
        .find(|entry| entry.address == minter)
        .ok_or(StablecoinError::MinterNotFound)?;
    require!(
        minter_entry.minted.saturating_add(amount) <= minter_entry.quota,
        StablecoinError::QuotaExceeded
    );

    let seeds = &[
        StablecoinConfig::SEED_PREFIX.as_bytes(),
        config.authority.as_ref(),
        config.symbol.as_bytes(),
        &[config.bump],
    ];

    let signer_seeds = &[&seeds[..]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.recipient_ata.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        signer_seeds,
    );
    mint_to(cpi_ctx, amount)?;

    let config = &mut ctx.accounts.config;
    config.total_minted = config.total_minted.saturating_add(amount);

    if let Some(entry) = ctx
        .accounts
        .role_registry
        .minters
        .iter_mut()
        .find(|entry| entry.address == minter)
    {
        entry.minted = entry.minted.saturating_add(amount);
    }

    emit!(Minted {
        minter,
        recipient: ctx.accounts.recipient_ata.owner,
        amount,
    });

    Ok(())
}
