use anchor_lang::prelude::*;
use anchor_spl::token_2022::{thaw_account, ThawAccount as ThawAccountCpi, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::errors::StablecoinError;
use crate::events::*;
use crate::state::{RoleRegistry, StablecoinConfig};

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    #[account(
        seeds = [StablecoinConfig::SEED_PREFIX.as_bytes(), config.authority.as_ref(), config.symbol.as_bytes()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        seeds = [RoleRegistry::SEED_PREFIX.as_bytes(), config.key().as_ref()],
        bump = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,
    #[account(mut, constraint = mint.key() == config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub target_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
}

pub fn thaw_account_handler(ctx: Context<ThawAccount>) -> Result<()> {
    let authority = ctx.accounts.authority.key();
    let allowed = ctx.accounts.role_registry.master == authority
        || ctx.accounts.role_registry.pausers.contains(&authority);
    require!(allowed, StablecoinError::Unauthorized);

    let config = &ctx.accounts.config;
    let signer_seeds = &[
        StablecoinConfig::SEED_PREFIX.as_bytes(),
        config.authority.as_ref(),
        config.symbol.as_bytes(),
        &[config.bump],
    ];

    let signer_binding = [&signer_seeds[..]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        ThawAccountCpi {
            account: ctx.accounts.target_ata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        &signer_binding,
    );
    thaw_account(cpi_ctx)?;

    emit!(AccountThawed {
        authority,
        target: ctx.accounts.target_ata.key(),
    });
    Ok(())
}
