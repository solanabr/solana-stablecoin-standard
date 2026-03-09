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

    /// CHECK: The Token-2022 mint account. Address validated against config, owner against Token-2022.
    #[account(
        mut,
        address = config.mint,
        constraint = mint.owner == &token_program.key() @ SssError::InvalidAuthority,
    )]
    pub mint: UncheckedAccount<'info>,

    /// The token account to burn from. Must belong to this mint.
    /// If self-burn: token::authority must equal burner.
    /// If authority burn: burner must be master_authority and permanent delegate must be enabled.
    #[account(
        mut,
        token::mint = config.mint,
        token::token_program = token_program,
    )]
    pub burn_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::BurnAmountZero);

    let config = &ctx.accounts.config;
    require_not_paused(config)?;

    require!(
        ctx.accounts.burn_token_account.amount >= amount,
        SssError::InsufficientBalance
    );

    let clock = Clock::get()?;
    let burner_key = ctx.accounts.burner.key();
    let token_account_owner = ctx.accounts.burn_token_account.owner;

    if burner_key == token_account_owner {
        // Path 1: Self-burn — token holder burns their own tokens
        token_2022::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.burn_token_account.to_account_info(),
                    authority: ctx.accounts.burner.to_account_info(),
                },
            ),
            amount,
        )?;
    } else if burner_key == config.master_authority {
        // Path 2: Authority burn — master authority burns from any account via permanent delegate
        require!(
            config.enable_permanent_delegate,
            SssError::FeatureNotEnabled
        );

        let mint_key = config.mint;
        let signer_seeds: &[&[&[u8]]] = &[&[
            StablecoinConfig::SEED_PREFIX,
            mint_key.as_ref(),
            &[config.bump],
        ]];

        token_2022::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.burn_token_account.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(), // permanent delegate
                },
                signer_seeds,
            ),
            amount,
        )?;
    } else {
        return Err(SssError::InvalidAuthority.into());
    }

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
        from: ctx.accounts.burn_token_account.key(),
        amount,
        total_burned: config.total_burned,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
