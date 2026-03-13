use anchor_lang::prelude::*;
use anchor_spl::token_interface::{freeze_account, thaw_account, FreezeAccount, ThawAccount, Mint, Token2022, TokenAccount};
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct ToggleFreeze<'info> {
    #[account(mut)]
    pub pauser: Signer<'info>,

    #[account()]
    pub config: Account<'info, StablecoinConfig>,

    // Note: The pauser role handles freezing per standard requirements
    #[account(
        seeds = [b"role", config.key().as_ref(), pauser.key().as_ref()],
        bump,
        constraint = role_registry.has_pauser @ StablecoinError::Unauthorized
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub account_to_freeze: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn freeze(ctx: Context<ToggleFreeze>) -> Result<()> {
    let seeds = &[
        b"config",
        ctx.accounts.mint.to_account_info().key.as_ref(),
        &[ctx.accounts.config.bump],
    ];
    let signer = &[&seeds[..]];

    let cpi_accounts = FreezeAccount {
        account: ctx.accounts.account_to_freeze.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.config.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer);

    freeze_account(cpi_ctx)?;
    Ok(())
}

pub fn thaw(ctx: Context<ToggleFreeze>) -> Result<()> {
    let seeds = &[
        b"config",
        ctx.accounts.mint.to_account_info().key.as_ref(),
        &[ctx.accounts.config.bump],
    ];
    let signer = &[&seeds[..]];

    let cpi_accounts = ThawAccount {
        account: ctx.accounts.account_to_freeze.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.config.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer);

    thaw_account(cpi_ctx)?;
    Ok(())
}
