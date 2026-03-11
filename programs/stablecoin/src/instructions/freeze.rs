use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
    freeze_account, thaw_account,
    FreezeAccount as FreezeAccountCpi,
    ThawAccount as ThawAccountCpi,
};

use crate::state::*;
use crate::errors::SSSError;
use crate::events::{FreezeEvent, FreezeAction};

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        constraint = (config.owner == authority.key() || config.blacklister == authority.key()) @ SSSError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: PDA freeze authority
    #[account(
        seeds = [b"authority", mint.key().as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn freeze_handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.bumps.mint_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[b"authority", mint_key.as_ref(), &[bump]]];

    freeze_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccountCpi {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    emit!(FreezeEvent {
        mint: ctx.accounts.mint.key(),
        account: ctx.accounts.token_account.key(),
        action: FreezeAction::Frozen,
        by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        constraint = (config.owner == authority.key() || config.blacklister == authority.key()) @ SSSError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: PDA freeze authority
    #[account(
        seeds = [b"authority", mint.key().as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn thaw_handler(ctx: Context<ThawTokenAccount>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.bumps.mint_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[b"authority", mint_key.as_ref(), &[bump]]];

    thaw_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccountCpi {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    emit!(FreezeEvent {
        mint: ctx.accounts.mint.key(),
        account: ctx.accounts.token_account.key(),
        action: FreezeAction::Thawed,
        by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
