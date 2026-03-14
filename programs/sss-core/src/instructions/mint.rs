use anchor_lang::prelude::*;
use anchor_spl::token_2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, MintTo};

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::TokensMinted;
use crate::state::{StablecoinConfig, RoleAssignment, MinterQuota};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = !config.paused @ StablecoinError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Minter role assignment
    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[ROLE_MINTER], minter.key().as_ref()],
        bump = minter_role.bump,
        constraint = minter_role.config == config.key() @ StablecoinError::Unauthorized,
        constraint = minter_role.role == ROLE_MINTER @ StablecoinError::Unauthorized,
        constraint = minter_role.active @ StablecoinError::RoleNotActive,
    )]
    pub minter_role: Account<'info, RoleAssignment>,

    /// Minter quota tracking
    #[account(
        mut,
        seeds = [QUOTA_SEED, config.key().as_ref(), minter.key().as_ref()],
        bump = minter_quota.bump,
        constraint = minter_quota.config == config.key() @ StablecoinError::Unauthorized,
        constraint = minter_quota.minter == minter.key() @ StablecoinError::Unauthorized,
    )]
    pub minter_quota: Account<'info, MinterQuota>,

    #[account(
        mut,
        constraint = mint.key() == config.mint @ StablecoinError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);

    // Check supply cap
    let config = &ctx.accounts.config;
    if config.supply_cap > 0 {
        let current_supply = config.current_supply();
        let new_supply = current_supply
            .checked_add(amount)
            .ok_or(StablecoinError::MathOverflow)?;
        require!(new_supply <= config.supply_cap, StablecoinError::SupplyCapExceeded);
    }

    let quota = &ctx.accounts.minter_quota;
    if quota.quota_limit != UNLIMITED_QUOTA {
        let new_minted = quota.minted_amount
            .checked_add(amount)
            .ok_or(StablecoinError::MathOverflow)?;
        require!(new_minted <= quota.quota_limit, StablecoinError::QuotaExceeded);
    }

    let mint_key = ctx.accounts.config.mint;
    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        CONFIG_SEED,
        mint_key.as_ref(),
        &[bump],
    ]];

    // Mint tokens via config PDA (mint authority)
    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Update quota
    let quota = &mut ctx.accounts.minter_quota;
    quota.minted_amount = quota.minted_amount
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;

    // Update config totals
    let config = &mut ctx.accounts.config;
    config.total_minted = config.total_minted
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;

    emit!(TokensMinted {
        config: config.key(),
        minter: ctx.accounts.minter.key(),
        recipient: ctx.accounts.recipient_token_account.key(),
        amount,
    });

    Ok(())
}
