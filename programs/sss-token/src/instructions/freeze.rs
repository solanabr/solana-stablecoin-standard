use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use spl_token_2022::instruction as t22_ix;

use crate::errors::SssError;
use crate::state::*;

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"sss_config", mint.key().as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, TokenConfig>,

    #[account(
        seeds = [b"sss_role", config.key().as_ref(), authority.key().as_ref()],
        bump = role.bump,
        constraint = role.config == config.key(),
        constraint = role.authority == authority.key(),
    )]
    pub role: Account<'info, RoleAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// The token account to freeze
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub target_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler_freeze(ctx: Context<FreezeAccount>) -> Result<()> {
    require!(
        ctx.accounts.role.has_role(role_flags::FREEZER),
        SssError::Unauthorized
    );

    let config = &ctx.accounts.config;
    let mint_key = config.mint;
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"sss_config",
        mint_key.as_ref(),
        &[config.bump],
    ]];

    anchor_lang::solana_program::program::invoke_signed(
        &t22_ix::freeze_account(
            ctx.accounts.token_program.key,
            &ctx.accounts.target_account.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.config.key(), // freeze authority = config PDA
            &[],
        )?,
        &[
            ctx.accounts.target_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        signer_seeds,
    )?;

    msg!("Froze account {}", ctx.accounts.target_account.key());
    Ok(())
}

pub fn handler_thaw(ctx: Context<FreezeAccount>) -> Result<()> {
    require!(
        ctx.accounts.role.has_role(role_flags::FREEZER),
        SssError::Unauthorized
    );

    let config = &ctx.accounts.config;
    let mint_key = config.mint;
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"sss_config",
        mint_key.as_ref(),
        &[config.bump],
    ]];

    anchor_lang::solana_program::program::invoke_signed(
        &t22_ix::thaw_account(
            ctx.accounts.token_program.key,
            &ctx.accounts.target_account.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.config.key(),
            &[],
        )?,
        &[
            ctx.accounts.target_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        signer_seeds,
    )?;

    msg!("Thawed account {}", ctx.accounts.target_account.key());
    Ok(())
}
