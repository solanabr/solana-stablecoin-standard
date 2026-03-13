use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, Burn, burn, MintTo, mint_to};

use crate::constants::*;
use crate::error::SSSError;
use crate::events::TokensSeized;
use crate::state::*;

/// Seize tokens from a blacklisted/frozen account.
/// SSS-2 only — uses burn + mint_to pattern instead of transfer_checked.
/// This avoids the transfer hook blocking transfers FROM blacklisted accounts.
#[derive(Accounts)]
pub struct Seize<'info> {
    pub seizer: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
        constraint = stablecoin_config.enable_permanent_delegate @ SSSError::PermanentDelegateNotEnabled,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref(), seizer.key().as_ref()],
        bump = seizer_roles.bump,
        constraint = seizer_roles.roles & Role::SEIZER != 0 @ SSSError::Unauthorized,
        constraint = seizer_roles.active @ SSSError::Unauthorized,
    )]
    pub seizer_roles: Account<'info, RoleAccount>,

    #[account(
        mut,
        constraint = mint.key() == stablecoin_config.mint @ SSSError::InvalidAuthority,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub to_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<Seize>) -> Result<()> {
    let amount = ctx.accounts.from_token_account.amount;
    require!(amount > 0, SSSError::ZeroAmount);

    let mint_key = ctx.accounts.mint.key();
    let config = &ctx.accounts.stablecoin_config;
    let seeds = &[
        STABLECOIN_SEED,
        mint_key.as_ref(),
        &[config.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Burn from the seized account (using permanent delegate authority)
    burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.from_token_account.to_account_info(),
                authority: ctx.accounts.stablecoin_config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Mint equivalent amount to treasury
    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to_token_account.to_account_info(),
                authority: ctx.accounts.stablecoin_config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Net supply unchanged — burn + mint cancel out. No need to update counters.

    let clock = Clock::get()?;
    emit!(TokensSeized {
        mint: ctx.accounts.stablecoin_config.mint,
        from: ctx.accounts.from_token_account.key(),
        to: ctx.accounts.to_token_account.key(),
        amount,
        authority: ctx.accounts.seizer.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
