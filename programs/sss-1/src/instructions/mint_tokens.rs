use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount},
};

use crate::{
    constants::{CONFIG_SEED, ROLE_SEED},
    error::StablecoinError,
    events::TokensMinted,
    state::{Role, RoleType, StablecoinConfig},
};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub minter: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = !config.paused @ StablecoinError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), minter.key().as_ref(), &[RoleType::Minter as u8]],
        bump = role.bump,
        constraint = role.role_type == RoleType::Minter as u8 @ StablecoinError::Unauthorized,
    )]
    pub role: Account<'info, Role>,

    #[account(
        mut,
        constraint = mint.key() == config.mint @ StablecoinError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);

    let mint_key = ctx.accounts.config.mint;
    let config_bump = ctx.accounts.config.bump;
    let config_bump_bytes = [config_bump];
    let signer_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &config_bump_bytes];

    anchor_spl::token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_2022::MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    emit!(TokensMinted {
        config: ctx.accounts.config.key(),
        minter: ctx.accounts.minter.key(),
        destination: ctx.accounts.destination.key(),
        amount,
    });

    Ok(())
}
