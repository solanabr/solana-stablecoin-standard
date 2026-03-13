use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount},
};

use crate::{
    constants::{CONFIG_SEED, ROLE_SEED},
    error::StablecoinError,
    events::TokensBurned,
    state::{Role, RoleType, StablecoinConfig},
};

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub burner: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = !config.paused @ StablecoinError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), burner.key().as_ref(), &[RoleType::Burner as u8]],
        bump = role.bump,
        constraint = role.role_type == RoleType::Burner as u8 @ StablecoinError::Unauthorized,
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
    pub source: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);

    let mint_key = ctx.accounts.config.mint;
    let config_bump = ctx.accounts.config.bump;
    let config_bump_bytes = [config_bump];
    let signer_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &config_bump_bytes];

    anchor_spl::token_2022::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_2022::Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.source.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    emit!(TokensBurned {
        config: ctx.accounts.config.key(),
        burner: ctx.accounts.burner.key(),
        source: ctx.accounts.source.key(),
        amount,
    });

    Ok(())
}
