use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    freeze_account, thaw_account, FreezeAccount, Mint, ThawAccount, TokenAccount, TokenInterface,
};

use crate::{
    constants::*,
    error::SSSError,
    events::{AccountFrozen, AccountThawed},
    state::{RoleManager, StablecoinConfig},
};

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref()],
        bump = role_manager.bump,
    )]
    pub role_manager: Account<'info, RoleManager>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn freeze_handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    let config = &ctx.accounts.stablecoin_config;
    let roles = &ctx.accounts.role_manager;
    let signer_key = ctx.accounts.authority.key();
    let mint_key = ctx.accounts.mint.key();
    let bump = config.bump;

    require!(
        config.authority == signer_key || roles.pausers.contains(&signer_key),
        SSSError::Unauthorized
    );

    freeze_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        FreezeAccount {
            account: ctx.accounts.token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.stablecoin_config.to_account_info(),
        },
        &[&[STABLECOIN_SEED, mint_key.as_ref(), &[bump]]],
    ))?;

    emit!(AccountFrozen {
        mint: mint_key,
        account: ctx.accounts.token_account.key(),
        by: signer_key,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref()],
        bump = role_manager.bump,
    )]
    pub role_manager: Account<'info, RoleManager>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn thaw_handler(ctx: Context<ThawTokenAccount>) -> Result<()> {
    let config = &ctx.accounts.stablecoin_config;
    let roles = &ctx.accounts.role_manager;
    let signer_key = ctx.accounts.authority.key();
    let mint_key = ctx.accounts.mint.key();
    let bump = config.bump;

    require!(
        config.authority == signer_key || roles.pausers.contains(&signer_key),
        SSSError::Unauthorized
    );

    thaw_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        ThawAccount {
            account: ctx.accounts.token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.stablecoin_config.to_account_info(),
        },
        &[&[STABLECOIN_SEED, mint_key.as_ref(), &[bump]]],
    ))?;

    emit!(AccountThawed {
        mint: mint_key,
        account: ctx.accounts.token_account.key(),
        by: signer_key,
    });

    Ok(())
}
