use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{freeze_account as spl_freeze, FreezeAccount as SplFreeze, Mint, TokenAccount},
};

use crate::{errors::SssError, events::AccountFrozen, state::StablecoinState};

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
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
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Freeze authority PDA
    #[account(
        seeds = [b"freeze_authority", state.key().as_ref()],
        bump,
    )]
    pub freeze_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<FreezeAccount>) -> Result<()> {
    let authority_key = ctx.accounts.authority.key();
    let state = &ctx.accounts.state;

    let is_authorized = authority_key == state.master_authority
        || state.pauser.map_or(false, |p| p == authority_key)
        || state.blacklister.map_or(false, |b| b == authority_key);

    require!(is_authorized, SssError::Unauthorized);

    let state_key = ctx.accounts.state.key();
    let freeze_authority_seeds = &[
        b"freeze_authority",
        state_key.as_ref(),
        &[ctx.bumps.freeze_authority],
    ];

    spl_freeze(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SplFreeze {
                mint: ctx.accounts.mint.to_account_info(),
                account: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.freeze_authority.to_account_info(),
            },
            &[freeze_authority_seeds],
        ),
    )?;

    emit!(AccountFrozen {
        mint: ctx.accounts.mint.key(),
        account: ctx.accounts.token_account.key(),
        authority: authority_key,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}