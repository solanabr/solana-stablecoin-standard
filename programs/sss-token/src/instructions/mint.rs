use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface};

use crate::state::{MinterState, StablecoinState};
use super::SssError;

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub minter: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump = stablecoin_state.bump,
        constraint = !stablecoin_state.paused @ SssError::Paused,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    #[account(
        mut,
        seeds = [b"minter", stablecoin_state.key().as_ref(), minter.key().as_ref()],
        bump = minter_state.bump,
        constraint = minter_state.active @ SssError::Unauthorized,
        constraint = minter_state.minter == minter.key() @ SssError::Unauthorized,
    )]
    pub minter_state: Account<'info, MinterState>,

    #[account(
        mut,
        constraint = mint.key() == stablecoin_state.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = recipient_token_account.mint == mint.key(),
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn mint_handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    let minter_state = &mut ctx.accounts.minter_state;

    // Check quota
    if let Some(quota) = minter_state.quota {
        require!(
            minter_state.minted.checked_add(amount).unwrap() <= quota,
            SssError::QuotaExceeded
        );
    }

    minter_state.minted = minter_state.minted.checked_add(amount).unwrap();

    // Mint via PDA signer
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        b"stablecoin",
        mint_key.as_ref(),
        &[ctx.accounts.stablecoin_state.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.stablecoin_state.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    msg!("SSS: Minted {} tokens", amount);
    Ok(())
}
