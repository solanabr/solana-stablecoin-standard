use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::spl_token_2022::{self, instruction as token_instruction};

use crate::errors::StablecoinError;
use crate::state::{StablecoinConfig, RoleAssignment, Role};

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin-config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), burner.key().as_ref()],
        bump = role_assignment.bump,
        constraint = role_assignment.has_role(Role::Burner) @ StablecoinError::Unauthorized,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    /// CHECK: Validated against config.
    #[account(mut, address = config.mint)]
    pub mint: AccountInfo<'info>,

    /// CHECK: Validated by token-2022 during CPI.
    #[account(mut)]
    pub source: AccountInfo<'info>,

    /// CHECK: Validated by token-2022 during CPI.
    pub source_authority: AccountInfo<'info>,

    /// CHECK: Validated by address.
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);
    require!(!ctx.accounts.config.paused, StablecoinError::Paused);

    invoke_signed(
        &token_instruction::burn(
            &spl_token_2022::ID,
            ctx.accounts.source.key,
            ctx.accounts.mint.key,
            ctx.accounts.source_authority.key,
            &[],
            amount,
        )?,
        &[
            ctx.accounts.source.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.source_authority.to_account_info(),
        ],
        &[],
    )?;

    let config = &mut ctx.accounts.config;
    config.total_burned = config
        .total_burned
        .checked_add(amount)
        .ok_or(StablecoinError::Overflow)?;
    config.updated_at = Clock::get()?.slot;

    msg!("Burned {} tokens from {}", amount, ctx.accounts.source.key);
    Ok(())
}
