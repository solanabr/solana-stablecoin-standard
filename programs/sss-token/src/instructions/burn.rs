use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, Burn, Token2022},
    token_interface::TokenAccount,
};

use crate::errors::SssError;
use crate::events::TokensBurned;
use crate::state::*;
use crate::utils::require_not_paused;

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: The Token-2022 mint account, validated by config.
    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = config.mint,
        token::authority = burner,
        token::token_program = token_program,
    )]
    pub burner_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::BurnAmountZero);

    let config = &ctx.accounts.config;
    require_not_paused(config)?;

    let clock = Clock::get()?;

    // Burn tokens — the burner signs as token account owner
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

    // Update config stats
    let config = &mut ctx.accounts.config;
    config.total_burned = config
        .total_burned
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;
    config.updated_at = clock.unix_timestamp;

    emit!(TokensBurned {
        config: config.key(),
        burner: ctx.accounts.burner.key(),
        from: ctx.accounts.burner_token_account.key(),
        amount,
        total_burned: config.total_burned,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
