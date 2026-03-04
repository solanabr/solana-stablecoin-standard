use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, FreezeAccount, Mint, ThawAccount, TokenAccount, TokenInterface,
};

use crate::{
    error::StablecoinError,
    events::AccountFrozen,
    state::{RoleEntry, RoleType, StablecoinConfig, CONFIG_SEED, ROLE_SEED},
};

// ─────────────────────────────────────────────────────────────────────────────
// FreezeAccount instruction
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct FreezeAccountCtx<'info> {
    /// Signer — must be master authority or hold Freezer role.
    pub authority: Signer<'info>,

    /// Config PDA — holds the freeze authority over the mint.
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The Token-2022 mint.
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token account to freeze.
    #[account(
        mut,
        constraint = token_account.mint == mint.key() @ StablecoinError::Unauthorized,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    /// Optional Freezer role PDA. Required when not master authority.
    #[account(
        seeds = [
            ROLE_SEED,
            mint.key().as_ref(),
            &[RoleType::Freezer as u8],
            authority.key().as_ref(),
        ],
        bump = freezer_role.bump,
        constraint = freezer_role.mint == mint.key() @ StablecoinError::Unauthorized,
        constraint = freezer_role.address == authority.key() @ StablecoinError::Unauthorized,
        constraint = freezer_role.role == RoleType::Freezer @ StablecoinError::Unauthorized,
    )]
    pub freezer_role: Option<Account<'info, RoleEntry>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn freeze_handler(ctx: Context<FreezeAccountCtx>) -> Result<()> {
    let config = &ctx.accounts.config;
    let caller = ctx.accounts.authority.key();
    let is_master = caller == config.authority;

    if !is_master {
        let role = ctx
            .accounts
            .freezer_role
            .as_ref()
            .ok_or(StablecoinError::Unauthorized)?;
        require!(role.active, StablecoinError::RoleInactive);
    }

    let mint_key = ctx.accounts.mint.key();
    let config_bump = config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[config_bump]]];

    token_interface::freeze_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    emit!(AccountFrozen {
        mint: mint_key,
        account: ctx.accounts.token_account.key(),
        frozen: true,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// ThawAccount instruction
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ThawAccountCtx<'info> {
    /// Signer — must be master authority or hold Freezer role.
    pub authority: Signer<'info>,

    /// Config PDA — holds the freeze authority over the mint.
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The Token-2022 mint.
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token account to thaw.
    #[account(
        mut,
        constraint = token_account.mint == mint.key() @ StablecoinError::Unauthorized,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    /// Optional Freezer role PDA. Required when not master authority.
    #[account(
        seeds = [
            ROLE_SEED,
            mint.key().as_ref(),
            &[RoleType::Freezer as u8],
            authority.key().as_ref(),
        ],
        bump = freezer_role.bump,
        constraint = freezer_role.mint == mint.key() @ StablecoinError::Unauthorized,
        constraint = freezer_role.address == authority.key() @ StablecoinError::Unauthorized,
        constraint = freezer_role.role == RoleType::Freezer @ StablecoinError::Unauthorized,
    )]
    pub freezer_role: Option<Account<'info, RoleEntry>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn thaw_handler(ctx: Context<ThawAccountCtx>) -> Result<()> {
    let config = &ctx.accounts.config;
    let caller = ctx.accounts.authority.key();
    let is_master = caller == config.authority;

    if !is_master {
        let role = ctx
            .accounts
            .freezer_role
            .as_ref()
            .ok_or(StablecoinError::Unauthorized)?;
        require!(role.active, StablecoinError::RoleInactive);
    }

    let mint_key = ctx.accounts.mint.key();
    let config_bump = config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[config_bump]]];

    token_interface::thaw_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccount {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    emit!(AccountFrozen {
        mint: mint_key,
        account: ctx.accounts.token_account.key(),
        frozen: false,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
