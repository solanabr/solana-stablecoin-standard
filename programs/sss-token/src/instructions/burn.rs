use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{burn as spl_burn, Burn, Mint, TokenAccount},
};

use crate::{
    errors::SssError,
    events::TokensBurned,
    state::StablecoinState,
};

#[derive(Accounts)]
pub struct BurnCtx<'info> {
    /// Must be master, burner, or token account owner burning their own tokens
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump = state.bump,
    )]
    pub state: Account<'info, StablecoinState>,

    #[account(
        mut,
        constraint = mint.key() == state.mint @ SssError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<BurnCtx>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.state.paused, SssError::ProtocolPaused);
    require!(amount > 0, SssError::ZeroAmount);

    let authority_key = ctx.accounts.authority.key();
    let state = &ctx.accounts.state;

    // Allowed: master authority, designated burner, or the token owner themselves
    let is_authorized = authority_key == state.master_authority
        || state.burner.map_or(false, |b| b == authority_key)
        || authority_key == ctx.accounts.from_token_account.owner;

    require!(is_authorized, SssError::Unauthorized);

    spl_burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.from_token_account.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        amount,
    )?;

    let state = &mut ctx.accounts.state;
    state.total_burned = state.total_burned.checked_add(amount).ok_or(SssError::Overflow)?;

    let total_supply = state.total_minted.saturating_sub(state.total_burned);

    emit!(TokensBurned {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.from_token_account.key(),
        amount,
        burner: authority_key,
        total_supply,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}