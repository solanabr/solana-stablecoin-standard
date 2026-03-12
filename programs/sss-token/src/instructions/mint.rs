use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{mint_to, Mint, MintTo, TokenAccount},
};

use crate::{
    errors::SssError,
    events::TokensMinted,
    state::{MinterInfo, StablecoinState},
};

#[derive(Accounts)]
pub struct MintCtx<'info> {
    pub minter: Signer<'info>,

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
        seeds = [b"minter", state.key().as_ref(), minter.key().as_ref()],
        bump = minter_info.bump,
        constraint = minter_info.active @ SssError::MinterInactive,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Mint authority PDA
    #[account(
        seeds = [b"mint_authority", state.key().as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<MintCtx>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.state.paused, SssError::ProtocolPaused);
    require!(amount > 0, SssError::ZeroAmount);

    let minter_info = &mut ctx.accounts.minter_info;

    let new_minted = minter_info
        .minted_this_epoch
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;

    // Quota check (0 = unlimited)
    if minter_info.quota > 0 {
        require!(new_minted <= minter_info.quota, SssError::QuotaExceeded);
    }

    minter_info.minted_this_epoch = new_minted;

    // Mint via PDA authority
    let state_key = ctx.accounts.state.key();
    let mint_authority_seeds = &[
        b"mint_authority",
        state_key.as_ref(),
        &[ctx.bumps.mint_authority],
    ];

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            &[mint_authority_seeds],
        ),
        amount,
    )?;

    let state = &mut ctx.accounts.state;
    state.total_minted = state.total_minted.checked_add(amount).ok_or(SssError::Overflow)?;

    let total_supply = state.total_minted.saturating_sub(state.total_burned);

    emit!(TokensMinted {
        mint: ctx.accounts.mint.key(),
        recipient: ctx.accounts.recipient_token_account.key(),
        amount,
        minter: ctx.accounts.minter.key(),
        total_supply,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}