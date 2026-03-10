use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, FreezeAccount, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::error::SSSError;
use crate::events::AccountFrozen;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    /// Must be either the authority or the blacklister.
    pub signer: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = (
            signer.key() == config.authority || signer.key() == config.blacklister
        ) @ SSSError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub target_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: PDA validated by seeds. Signs the freeze CPI.
    #[account(
        seeds = [MINT_AUTHORITY_SEED, mint.key().as_ref()],
        bump = config.mint_authority_bump,
    )]
    pub mint_authority: SystemAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handle_freeze(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    // ── EXECUTE CPI: freeze_account ─────────────────────────────────────────
    // Note: freeze/thaw works even when paused (emergency powers).
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        MINT_AUTHORITY_SEED,
        mint_key.as_ref(),
        &[ctx.accounts.config.mint_authority_bump],
    ]];

    token_2022::freeze_account(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.target_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
        )
        .with_signer(signer_seeds),
    )?;

    // ── EMIT EVENT ──────────────────────────────────────────────────────────
    emit!(AccountFrozen {
        config: ctx.accounts.config.key(),
        token_account: ctx.accounts.target_token_account.key(),
        frozen_by: ctx.accounts.signer.key(),
    });

    Ok(())
}
