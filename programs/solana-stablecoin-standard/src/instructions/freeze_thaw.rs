use anchor_lang::prelude::*;
use anchor_spl::token_2022::{freeze_account, thaw_account, FreezeAccount, ThawAccount};
use anchor_spl::token_interface::TokenInterface;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::error::SssError;
use crate::state::*;

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    /// Must be master_authority (freeze authority on the mint)
    pub authority: Signer<'info>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn freeze_handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    let caller = ctx.accounts.authority.key();
    let roles = &ctx.accounts.roles_config;
    require!(
        caller == roles.master_authority || caller == roles.pauser,
        SssError::Unauthorized
    );

    let cpi_accounts = FreezeAccount {
        account: ctx.accounts.token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    freeze_account(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
    )?;

    msg!("Frozen account: {}", ctx.accounts.token_account.key());
    Ok(())
}

pub fn thaw_handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    let caller = ctx.accounts.authority.key();
    let roles = &ctx.accounts.roles_config;
    require!(
        caller == roles.master_authority || caller == roles.pauser,
        SssError::Unauthorized
    );

    let cpi_accounts = ThawAccount {
        account: ctx.accounts.token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    thaw_account(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
    )?;

    msg!("Thawed account: {}", ctx.accounts.token_account.key());
    Ok(())
}
