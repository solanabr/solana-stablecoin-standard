use anchor_lang::prelude::*;
use anchor_spl::token_2022::{mint_to, MintTo};
use anchor_spl::token_interface::TokenInterface;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::error::SssError;
use crate::state::*;

#[derive(Accounts)]
pub struct MintTokens<'info> {
    /// Must be the authorized minter
    pub minter: Signer<'info>,

    /// The Token-2022 mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Stablecoin config PDA
    #[account(
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    /// Roles config PDA (mut required for minted_this_epoch quota tracking)
    #[account(
        mut,
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    /// Destination token account
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);
    require!(!ctx.accounts.stablecoin_config.paused, SssError::TransfersPaused);

    let roles = &ctx.accounts.roles_config;
    let config = &ctx.accounts.stablecoin_config;
    let caller = ctx.accounts.minter.key();

    // Check minter authorization
    require!(
        caller == roles.minter || caller == roles.master_authority,
        SssError::Unauthorized
    );

    // Check quota (if set)
    if roles.minter_quota > 0 {
        let new_total = roles
            .minted_this_epoch
            .checked_add(amount)
            .ok_or(SssError::MinterQuotaExceeded)?;
        require!(new_total <= roles.minter_quota, SssError::MinterQuotaExceeded);
    }

    // Check max supply (if set)
    if config.max_supply > 0 {
        let current_supply = ctx.accounts.mint.supply;
        let new_supply = current_supply
            .checked_add(amount)
            .ok_or(SssError::MaxSupplyExceeded)?;
        require!(new_supply <= config.max_supply, SssError::MaxSupplyExceeded);
    }

    // Mint tokens via CPI
    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.minter.to_account_info(),
    };
    mint_to(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        amount,
    )?;

    // Update quota tracking
    let roles_mut = &mut ctx.accounts.roles_config;
    if roles_mut.minter_quota > 0 {
        roles_mut.minted_this_epoch = roles_mut
            .minted_this_epoch
            .checked_add(amount)
            .unwrap();
    }

    msg!("Minted {} tokens to {}", amount, ctx.accounts.destination.key());
    Ok(())
}
