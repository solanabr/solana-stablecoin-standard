use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, FreezeAccount as FreezeAccountCpi, ThawAccount as ThawAccountCpi, Mint, TokenAccount, TokenInterface};

use crate::state::StablecoinState;
use super::SssError;

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.master_authority == authority.key() @ SssError::Unauthorized,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    #[account(constraint = mint.key() == stablecoin_state.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = token_account.mint == mint.key(),
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn freeze_handler(ctx: Context<FreezeAccount>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[b"stablecoin", mint_key.as_ref(), &[ctx.accounts.stablecoin_state.bump]];
    let signer_seeds = &[&seeds[..]];

    token_interface::freeze_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccountCpi {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.stablecoin_state.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    msg!("SSS: Froze account {}", ctx.accounts.token_account.key());
    Ok(())
}

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.master_authority == authority.key() @ SssError::Unauthorized,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    #[account(constraint = mint.key() == stablecoin_state.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = token_account.mint == mint.key(),
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn thaw_handler(ctx: Context<ThawAccount>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[b"stablecoin", mint_key.as_ref(), &[ctx.accounts.stablecoin_state.bump]];
    let signer_seeds = &[&seeds[..]];

    token_interface::thaw_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccountCpi {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.stablecoin_state.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    msg!("SSS: Thawed account {}", ctx.accounts.token_account.key());
    Ok(())
}
