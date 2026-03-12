use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{thaw_account, ThawAccount as ThawAccountCpi, Mint, TokenAccount};

use crate::{
    constants::STABLECOIN_SEED,
    error::SssError,
    events::AccountThawed,
    state::{RoleKind, StablecoinState},
};

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    pub caller: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_state.bump,
        has_one = mint,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub target_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<ThawAccount>) -> Result<()> {
    let state = &ctx.accounts.stablecoin_state;
    let caller = ctx.accounts.caller.key();
    require!(
        state.authority == caller
            || state.has_role(&caller, &RoleKind::Blacklister),
        SssError::Unauthorized
    );

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.accounts.stablecoin_state.bump;
    let seeds = &[STABLECOIN_SEED, mint_key.as_ref(), &[bump]];

    thaw_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccountCpi {
                account: ctx.accounts.target_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.stablecoin_state.to_account_info(),
            },
            &[seeds],
        ),
    )?;

    emit!(AccountThawed {
        mint: mint_key,
        account: ctx.accounts.target_account.key(),
        authority: caller,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
