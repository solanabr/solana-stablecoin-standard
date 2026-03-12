use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{burn, Burn, Mint, TokenAccount};

use crate::{
    constants::STABLECOIN_SEED,
    error::SssError,
    events::TokensBurned,
    state::{RoleKind, StablecoinState},
};

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_state.bump,
        has_one = mint,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The token account to burn from. Can be any account, burner must have authority.
    #[account(
        mut,
        token::mint = mint,
        token::authority = burner,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.stablecoin_state.paused, SssError::Paused);
    require!(amount > 0, SssError::ZeroAmount);
    require!(
        ctx.accounts.stablecoin_state.authority == ctx.accounts.burner.key()
            || ctx
                .accounts
                .stablecoin_state
                .has_role(&ctx.accounts.burner.key(), &RoleKind::Burner),
        SssError::Unauthorized
    );

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

    let new_supply = ctx.accounts.mint.supply.saturating_sub(amount);

    emit!(TokensBurned {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.token_account.key(),
        burner: ctx.accounts.burner.key(),
        amount,
        new_supply,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
