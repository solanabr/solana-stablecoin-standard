use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, Burn, burn};

use crate::constants::*;
use crate::error::SSSError;
use crate::events::TokensBurned;
use crate::state::*;

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
        constraint = !stablecoin_config.paused @ SSSError::Paused,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref(), burner.key().as_ref()],
        bump = burner_roles.bump,
        constraint = burner_roles.roles & Role::BURNER != 0 @ SSSError::Unauthorized,
        constraint = burner_roles.active @ SSSError::Unauthorized,
    )]
    pub burner_roles: Account<'info, RoleAccount>,

    #[account(
        mut,
        constraint = mint.key() == stablecoin_config.mint @ SSSError::InvalidAuthority,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = burner,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SSSError::ZeroAmount);
    require!(
        ctx.accounts.token_account.amount >= amount,
        SSSError::InsufficientBalance
    );

    let config = &mut ctx.accounts.stablecoin_config;
    config.total_burned = config.total_burned
        .checked_add(amount)
        .ok_or(SSSError::ArithmeticOverflow)?;

    burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.burner.to_account_info(),
            },
        ),
        amount,
    )?;

    let clock = Clock::get()?;
    emit!(TokensBurned {
        mint: config.mint,
        amount,
        new_supply: config.current_supply(),
        burner: ctx.accounts.burner.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
