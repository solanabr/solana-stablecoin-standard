use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, ThawAccount, thaw_account};

use crate::constants::*;
use crate::error::SSSError;
use crate::events::AccountThawedEvent;
use crate::state::*;

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    pub freezer: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref(), freezer.key().as_ref()],
        bump = freezer_roles.bump,
        constraint = freezer_roles.roles & Role::FREEZER != 0 @ SSSError::Unauthorized,
    )]
    pub freezer_roles: Account<'info, RoleAccount>,

    #[account(
        constraint = mint.key() == stablecoin_config.mint @ SSSError::InvalidAuthority,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub target_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<ThawTokenAccount>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let config = &ctx.accounts.stablecoin_config;
    let seeds = &[
        STABLECOIN_SEED,
        mint_key.as_ref(),
        &[config.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    thaw_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccount {
                account: ctx.accounts.target_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: config.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    let clock = Clock::get()?;
    emit!(AccountThawedEvent {
        mint: config.mint,
        account: ctx.accounts.target_token_account.key(),
        authority: ctx.accounts.freezer.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
