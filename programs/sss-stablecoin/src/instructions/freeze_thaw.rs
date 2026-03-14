//! Freeze and thaw instructions for account control

use crate::{
    constants::CONFIG_SEED,
    error::StablecoinError,
    events::{AccountFrozen, AccountThawed},
    state::StablecoinConfig,
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    freeze_account, thaw_account, Mint as TokenMint, Token2022, TokenAccount,
};

/// Freeze a token account
pub fn freeze_handler(ctx: Context<FreezeAccount>, target: Pubkey) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, StablecoinError::Paused);
    require!(
        is_pauser(config, &ctx.accounts.authority.key()),
        StablecoinError::Unauthorized
    );
    require_keys_eq!(
        target,
        ctx.accounts.token_account.key(),
        StablecoinError::InvalidTokenAccount
    );

    let mint_key = ctx.accounts.mint.key();
    let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
    let signer_seeds: &[&[&[u8]]] = &[config_seeds];

    let cpi_accounts = anchor_spl::token_interface::FreezeAccount {
        account: ctx.accounts.token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.config.to_account_info(),
    };
    freeze_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    ))?;

    emit!(AccountFrozen {
        mint: ctx.accounts.mint.key(),
        token_account: target,
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}

/// Thaw (unfreeze) a token account
pub fn thaw_handler(ctx: Context<ThawAccount>, target: Pubkey) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        is_pauser(config, &ctx.accounts.authority.key()),
        StablecoinError::Unauthorized
    );
    require_keys_eq!(
        target,
        ctx.accounts.token_account.key(),
        StablecoinError::InvalidTokenAccount
    );

    let mint_key = ctx.accounts.mint.key();
    let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
    let signer_seeds: &[&[&[u8]]] = &[config_seeds];

    let cpi_accounts = anchor_spl::token_interface::ThawAccount {
        account: ctx.accounts.token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.config.to_account_info(),
    };
    thaw_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    ))?;

    emit!(AccountThawed {
        mint: ctx.accounts.mint.key(),
        token_account: target,
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}

fn is_pauser(config: &StablecoinConfig, signer: &Pubkey) -> bool {
    *signer == config.master_authority || *signer == config.pauser
}

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}
