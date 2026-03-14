use anchor_lang::prelude::*;
use anchor_spl::token_2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, Burn};

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::TokensBurned;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = !config.paused @ StablecoinError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        constraint = mint.key() == config.mint @ StablecoinError::Unauthorized,
    )]
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
    require!(amount > 0, StablecoinError::ZeroAmount);

    // Burn tokens from the burner's account
    token_2022::burn(
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

    // Update config totals
    let config = &mut ctx.accounts.config;
    config.total_burned = config.total_burned
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;

    emit!(TokensBurned {
        config: config.key(),
        burner: ctx.accounts.burner.key(),
        amount,
    });

    Ok(())
}
