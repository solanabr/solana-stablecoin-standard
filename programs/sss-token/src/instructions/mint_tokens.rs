use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, MintTo, mint_to};

use crate::constants::*;
use crate::error::SSSError;
use crate::events::TokensMinted;
use crate::state::*;

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
        constraint = !stablecoin_config.paused @ SSSError::Paused,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref(), minter.key().as_ref()],
        bump = minter_roles.bump,
        constraint = minter_roles.roles & Role::MINTER != 0 @ SSSError::Unauthorized,
        constraint = minter_roles.active @ SSSError::Unauthorized,
    )]
    pub minter_roles: Account<'info, RoleAccount>,

    #[account(
        mut,
        seeds = [MINTER_SEED, stablecoin_config.key().as_ref(), minter.key().as_ref()],
        bump = minter_config.bump,
        constraint = minter_config.active @ SSSError::Unauthorized,
    )]
    pub minter_config: Account<'info, MinterConfig>,

    #[account(
        mut,
        constraint = mint.key() == stablecoin_config.mint @ SSSError::InvalidAuthority,
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
    require!(amount > 0, SSSError::ZeroAmount);

    let config = &ctx.accounts.stablecoin_config;
    require!(config.check_supply_cap(amount), SSSError::SupplyCapExceeded);

    let minter_config = &mut ctx.accounts.minter_config;
    if minter_config.quota > 0 {
        let new_minted = minter_config.minted
            .checked_add(amount)
            .ok_or(SSSError::ArithmeticOverflow)?;
        require!(new_minted <= minter_config.quota, SSSError::QuotaExceeded);
        minter_config.minted = new_minted;
    }

    let config = &mut ctx.accounts.stablecoin_config;
    config.total_minted = config.total_minted
        .checked_add(amount)
        .ok_or(SSSError::MintOverflow)?;

    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        STABLECOIN_SEED,
        mint_key.as_ref(),
        &[config.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let clock = Clock::get()?;
    emit!(TokensMinted {
        mint: config.mint,
        recipient: ctx.accounts.recipient_token_account.key(),
        amount,
        new_supply: config.current_supply(),
        minter: ctx.accounts.minter.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
