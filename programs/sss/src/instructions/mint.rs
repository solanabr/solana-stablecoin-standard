use anchor_lang::prelude::*;

use crate::{constants::*, error::StableError, events::MintTokensEvent, state::MinterAccount};
use anchor_spl::{token_2022::{self, MintTo, Token2022}, token_interface::TokenAccount};

#[event_cpi]
#[derive(Accounts)]
pub struct Mint<'info> {
    /// The minter; must have a MinterAccount PDA for this mint.
    pub minter: Signer<'info>,
    /// CHECK: Token-2022 mint PDA. Verified via minter_account seeds.
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
    /// Destination token account.
    #[account(mut)]
    pub to: InterfaceAccount<'info, TokenAccount>,
    /// Minter quota account. Seeds verify that `minter` holds this role for `mint`.
    #[account(
        mut,
        seeds = [ROLE_SEED, mint.key().as_ref(), MINTER_ROLE, minter.key().as_ref()],
        bump = minter_account.bump,
    )]
    pub minter_account: Account<'info, MinterAccount>,
    /// CHECK: Mint authority PDA — the program signs on its behalf via CPI.
    #[account(
        seeds = [MINTER_SEED, mint.key().as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Mint>, amount: u64) -> Result<()> {
    let minter_account = &mut ctx.accounts.minter_account;

    require!(
        minter_account.minted.checked_add(amount).unwrap() <= minter_account.allowance,
        StableError::QuotaExceeded
    );

    let minter = ctx.accounts.minter.key();
    let to = ctx.accounts.to.key();
    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.bumps.mint_authority;
    let mint_authority_seeds: &[&[u8]] = &[MINTER_SEED, mint_key.as_ref(), &[bump]];

    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            &[mint_authority_seeds],
        ),
        amount,
    )?;

    minter_account.minted = minter_account.minted.checked_add(amount).unwrap();

    emit_cpi!(MintTokensEvent { minter, to, mint: mint_key, amount });

    Ok(())
}
