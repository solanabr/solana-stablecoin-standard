use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{mint_to, Mint, MintTo, TokenAccount};

use crate::{
    constants::{MINTER_RECORD_SEED, STABLECOIN_SEED},
    error::SssError,
    events::TokensMinted,
    state::{MinterRecord, StablecoinState},
};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_state.bump,
        has_one = mint,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    #[account(
        mut,
        seeds = [MINTER_RECORD_SEED, mint.key().as_ref(), minter.key().as_ref()],
        bump = minter_record.bump,
        constraint = minter_record.minter == minter.key() @ SssError::Unauthorized,
        constraint = minter_record.active @ SssError::MinterInactive,
    )]
    pub minter_record: Account<'info, MinterRecord>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut, token::mint = mint)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.stablecoin_state.paused, SssError::Paused);
    require!(amount > 0, SssError::ZeroAmount);

    let record = &ctx.accounts.minter_record;
    if let Some(cap) = record.cap {
        let new_total = record
            .minted
            .checked_add(amount)
            .ok_or(SssError::MathOverflow)?;
        require!(new_total <= cap, SssError::MintCapExceeded);
    }

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.accounts.stablecoin_state.bump;
    let seeds = &[STABLECOIN_SEED, mint_key.as_ref(), &[bump]];

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.stablecoin_state.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    ctx.accounts.minter_record.minted = ctx
        .accounts
        .minter_record
        .minted
        .checked_add(amount)
        .ok_or(SssError::MathOverflow)?;

    let new_supply = ctx.accounts.mint.supply;

    emit!(TokensMinted {
        mint: mint_key,
        recipient: ctx.accounts.recipient_token_account.key(),
        minter: ctx.accounts.minter.key(),
        amount,
        new_supply,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
