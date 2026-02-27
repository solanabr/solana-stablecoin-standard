use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, ThawAccount, Token2022},
    token_interface::TokenAccount,
};

use crate::events::AccountThawed;
use crate::state::*;
use crate::utils::{require_master_authority, require_not_paused};

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [StablecoinConfig::SEED_PREFIX, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [RoleRegistry::SEED_PREFIX, config.key().as_ref()],
        bump = role_registry.bump,
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    /// CHECK: The Token-2022 mint account.
    #[account(address = config.mint)]
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = config.mint,
        token::token_program = token_program,
    )]
    pub target_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<ThawTokenAccount>) -> Result<()> {
    let config = &ctx.accounts.config;
    require_not_paused(config)?;
    require_master_authority(&ctx.accounts.role_registry, &ctx.accounts.authority.key())?;

    let clock = Clock::get()?;
    let mint_key = config.mint;
    let signer_seeds: &[&[&[u8]]] = &[&[
        StablecoinConfig::SEED_PREFIX,
        mint_key.as_ref(),
        &[config.bump],
    ]];

    token_2022::thaw_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        ThawAccount {
            account: ctx.accounts.target_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        signer_seeds,
    ))?;

    emit!(AccountThawed {
        config: config.key(),
        authority: ctx.accounts.authority.key(),
        target_account: ctx.accounts.target_token_account.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
