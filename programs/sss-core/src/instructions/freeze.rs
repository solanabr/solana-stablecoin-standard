use anchor_lang::prelude::*;
use anchor_spl::token_2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, FreezeAccount, ThawAccount};

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::{AccountFrozen as AccountFrozenEvent, AccountThawed as AccountThawedEvent};
use crate::state::{StablecoinConfig, RoleAssignment};

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    pub freezer: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = !config.paused @ StablecoinError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Freezer role assignment
    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[ROLE_FREEZER], freezer.key().as_ref()],
        bump = freezer_role.bump,
        constraint = freezer_role.config == config.key() @ StablecoinError::Unauthorized,
        constraint = freezer_role.role == ROLE_FREEZER @ StablecoinError::Unauthorized,
        constraint = freezer_role.active @ StablecoinError::RoleNotActive,
    )]
    pub freezer_role: Account<'info, RoleAssignment>,

    #[account(
        constraint = mint.key() == config.mint @ StablecoinError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub target_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn freeze_handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    let mint_key = ctx.accounts.config.mint;
    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        CONFIG_SEED,
        mint_key.as_ref(),
        &[bump],
    ]];

    token_2022::freeze_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.target_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    emit!(AccountFrozenEvent {
        config: ctx.accounts.config.key(),
        target: ctx.accounts.target_token_account.key(),
        freezer: ctx.accounts.freezer.key(),
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    pub freezer: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = !config.paused @ StablecoinError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Freezer role assignment
    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[ROLE_FREEZER], freezer.key().as_ref()],
        bump = freezer_role.bump,
        constraint = freezer_role.config == config.key() @ StablecoinError::Unauthorized,
        constraint = freezer_role.role == ROLE_FREEZER @ StablecoinError::Unauthorized,
        constraint = freezer_role.active @ StablecoinError::RoleNotActive,
    )]
    pub freezer_role: Account<'info, RoleAssignment>,

    #[account(
        constraint = mint.key() == config.mint @ StablecoinError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub target_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn thaw_handler(ctx: Context<ThawTokenAccount>) -> Result<()> {
    let mint_key = ctx.accounts.config.mint;
    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        CONFIG_SEED,
        mint_key.as_ref(),
        &[bump],
    ]];

    token_2022::thaw_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccount {
                account: ctx.accounts.target_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    emit!(AccountThawedEvent {
        config: ctx.accounts.config.key(),
        target: ctx.accounts.target_token_account.key(),
        freezer: ctx.accounts.freezer.key(),
    });

    Ok(())
}
