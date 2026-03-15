use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::spl_token_2022::{self, instruction as token_instruction};

use crate::errors::StablecoinError;
use crate::state::{StablecoinConfig, RoleAssignment, Role};

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"stablecoin-config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), authority.key().as_ref()],
        bump = role_assignment.bump,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    /// CHECK: Validated against config.
    #[account(address = config.mint)]
    pub mint: AccountInfo<'info>,

    /// CHECK: Validated by token-2022 during CPI.
    #[account(mut)]
    pub token_account: AccountInfo<'info>,

    /// CHECK: Validated by address.
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

pub fn handler(ctx: Context<ThawAccount>) -> Result<()> {
    let is_master = ctx.accounts.authority.key() == ctx.accounts.config.authority;
    let is_pauser = ctx.accounts.role_assignment.has_role(Role::Pauser);
    require!(is_master || is_pauser, StablecoinError::Unauthorized);

    let mint_key = ctx.accounts.config.mint;
    let config_seeds: &[&[u8]] = &[
        b"stablecoin-config",
        mint_key.as_ref(),
        &[ctx.accounts.config.bump],
    ];

    invoke_signed(
        &token_instruction::thaw_account(
            &spl_token_2022::ID,
            ctx.accounts.token_account.key,
            ctx.accounts.mint.key,
            &ctx.accounts.config.key(),
            &[],
        )?,
        &[
            ctx.accounts.token_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        &[config_seeds],
    )?;

    msg!("Thawed account {}", ctx.accounts.token_account.key);
    Ok(())
}
