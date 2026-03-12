use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, ThawAccount as ThawAccountCpi, TokenInterface};

use crate::state::{StablecoinConfig, RoleManager};
use crate::errors::SssError;

/// Accounts for the thaw_account instruction.
#[derive(Accounts)]
pub struct ThawAccount<'info> {
    /// The authority thawing the account.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager.
    #[account(
        seeds = [b"roles", config.key().as_ref()],
        bump = role_manager.bump,
        has_one = config,
    )]
    pub role_manager: Account<'info, RoleManager>,

    /// The Token-2022 mint.
    /// CHECK: Validated via config constraint.
    #[account(address = config.mint)]
    pub mint: AccountInfo<'info>,

    /// The token account to thaw.
    /// CHECK: Validated by token program CPI.
    #[account(mut)]
    pub token_account: AccountInfo<'info>,

    /// Token-2022 program.
    pub token_program: Interface<'info, TokenInterface>,
}

/// Event emitted when a token account is thawed.
#[event]
pub struct AccountThawed {
    pub config: Pubkey,
    pub token_account: Pubkey,
    pub thawed_by: Pubkey,
}

pub fn handler(ctx: Context<ThawAccount>) -> Result<()> {
    let config = &ctx.accounts.config;
    let role_manager = &ctx.accounts.role_manager;
    let authority_key = ctx.accounts.authority.key();

    // Only master authority can thaw
    require!(
        authority_key == role_manager.master_authority,
        SssError::UnauthorizedMasterAuthority
    );

    // CPI: Thaw account
    let mint_key = config.mint;
    let bump = config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"config", mint_key.as_ref(), &[bump]]];

    let cpi_accounts = ThawAccountCpi {
        account: ctx.accounts.token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.config.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );

    token_interface::thaw_account(cpi_ctx)?;

    emit!(AccountThawed {
        config: config.key(),
        token_account: ctx.accounts.token_account.key(),
        thawed_by: authority_key,
    });

    Ok(())
}
