use anchor_lang::prelude::*;
use anchor_spl::token_interface::{burn, Burn, Mint, TokenAccount, TokenInterface};

use crate::{
    constants::*,
    error::SSSError,
    events::TokensBurned,
    state::{RoleManager, StablecoinConfig},
};

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref()],
        bump = role_manager.bump,
    )]
    pub role_manager: Account<'info, RoleManager>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = burner,
    )]
    pub burner_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SSSError::ZeroAmount);

    let config = &ctx.accounts.stablecoin_config;
    let roles = &ctx.accounts.role_manager;
    let burner_key = ctx.accounts.burner.key();
    let mint_key = ctx.accounts.mint.key();

    require!(!config.paused, SSSError::Paused);
    require!(
        roles.burners.contains(&burner_key),
        SSSError::Unauthorized
    );

    burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.burner_token_account.to_account_info(),
                authority: ctx.accounts.burner.to_account_info(),
            },
        ),
        amount,
    )?;

    let config = &mut ctx.accounts.stablecoin_config;
    config.total_burned = config
        .total_burned
        .checked_add(amount)
        .ok_or(SSSError::MathOverflow)?;

    emit!(TokensBurned {
        mint: mint_key,
        from: ctx.accounts.burner_token_account.key(),
        amount,
        burner: burner_key,
    });

    Ok(())
}
