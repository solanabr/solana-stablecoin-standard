use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, MintTo, mint_to};

use crate::state::*;
use crate::errors::SssError;

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::InvalidAmount);

    let config = &ctx.accounts.config;
    require!(!config.is_paused, SssError::Paused);

    let roles = &mut ctx.accounts.roles_config;
    require!(roles.is_minter, SssError::Unauthorized);

    // supply cap check
    if config.supply_cap > 0 {
        let new_supply = config.total_minted
            .checked_add(amount)
            .ok_or(SssError::Overflow)?;
        let effective = new_supply.saturating_sub(config.total_burned);
        require!(effective <= config.supply_cap, SssError::SupplyCapExceeded);
    }

    // per-minter epoch quota
    let clock = Clock::get()?;
    require!(
        roles.check_and_update_quota(amount, clock.unix_timestamp),
        SssError::QuotaExceeded
    );

    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[
        b"config",
        mint_key.as_ref(),
        &[config.bump],
    ];

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    let config = &mut ctx.accounts.config;
    config.total_minted = config.total_minted
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;

    msg!("Minted {} tokens to {}", amount, ctx.accounts.destination.key());
    Ok(())
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        constraint = mint.key() == config.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"roles", config.key().as_ref(), minter.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    pub token_program: Interface<'info, TokenInterface>,
}
