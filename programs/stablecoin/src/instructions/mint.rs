use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::spl_token_2022::{self, instruction as token_instruction};

use crate::errors::StablecoinError;
use crate::state::{StablecoinConfig, RoleAssignment, Role};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin-config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [b"role", config.key().as_ref(), minter.key().as_ref()],
        bump = role_assignment.bump,
        constraint = role_assignment.has_role(Role::Minter) @ StablecoinError::Unauthorized,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    /// CHECK: Validated against config.
    #[account(mut, address = config.mint)]
    pub mint: AccountInfo<'info>,

    /// CHECK: Validated by token-2022 during CPI.
    #[account(mut)]
    pub destination: AccountInfo<'info>,

    /// CHECK: Validated by address.
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);
    require!(!ctx.accounts.config.paused, StablecoinError::Paused);

    // Check mint quota if set
    let role = &ctx.accounts.role_assignment;
    if role.mint_quota > 0 {
        require!(
            role.minted_amount.checked_add(amount).ok_or(StablecoinError::Overflow)?
                <= role.mint_quota,
            StablecoinError::MintQuotaExceeded
        );
    }

    let mint_key = ctx.accounts.config.mint;
    let config_seeds: &[&[u8]] = &[
        b"stablecoin-config",
        mint_key.as_ref(),
        &[ctx.accounts.config.bump],
    ];

    invoke_signed(
        &token_instruction::mint_to(
            &spl_token_2022::ID,
            ctx.accounts.mint.key,
            ctx.accounts.destination.key,
            &ctx.accounts.config.key(),
            &[],
            amount,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.destination.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        &[config_seeds],
    )?;

    let config = &mut ctx.accounts.config;
    config.total_minted = config
        .total_minted
        .checked_add(amount)
        .ok_or(StablecoinError::Overflow)?;
    config.updated_at = Clock::get()?.slot;

    let role = &mut ctx.accounts.role_assignment;
    role.minted_amount = role
        .minted_amount
        .checked_add(amount)
        .ok_or(StablecoinError::Overflow)?;

    msg!("Minted {} tokens to {}", amount, ctx.accounts.destination.key);
    Ok(())
}
