use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount},
};

use crate::{
    constants::{CONFIG_SEED, ROLE_SEED},
    error::StablecoinError,
    events::{AccountFrozen, AccountUnfrozen},
    state::{Role, RoleType, StablecoinConfig},
};

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    pub freezer: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.freeze_enabled @ StablecoinError::FreezeNotEnabled,
        constraint = !config.paused @ StablecoinError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), freezer.key().as_ref(), &[RoleType::Freezer as u8]],
        bump = role.bump,
        constraint = role.role_type == RoleType::Freezer as u8 @ StablecoinError::Unauthorized,
    )]
    pub role: Account<'info, Role>,

    #[account(
        constraint = mint.key() == config.mint @ StablecoinError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn freeze_handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    let mint_key = ctx.accounts.config.mint;
    let config_bump = ctx.accounts.config.bump;
    let config_bump_bytes = [config_bump];
    let signer_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &config_bump_bytes];

    anchor_spl::token_2022::freeze_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token_2022::FreezeAccount {
            account: ctx.accounts.token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        &[signer_seeds],
    ))?;

    emit!(AccountFrozen {
        config: ctx.accounts.config.key(),
        freezer: ctx.accounts.freezer.key(),
        account: ctx.accounts.token_account.key(),
    });

    Ok(())
}

pub fn unfreeze_handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    let mint_key = ctx.accounts.config.mint;
    let config_bump = ctx.accounts.config.bump;
    let config_bump_bytes = [config_bump];
    let signer_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &config_bump_bytes];

    anchor_spl::token_2022::thaw_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token_2022::ThawAccount {
            account: ctx.accounts.token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        &[signer_seeds],
    ))?;

    emit!(AccountUnfrozen {
        config: ctx.accounts.config.key(),
        freezer: ctx.accounts.freezer.key(),
        account: ctx.accounts.token_account.key(),
    });

    Ok(())
}
