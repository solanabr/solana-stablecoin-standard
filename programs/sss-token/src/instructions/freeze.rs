use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, FreezeAccount as FreezeAccountCpi, TokenInterface};

use crate::state::{StablecoinConfig, RoleManager};
use crate::errors::SssError;

/// Accounts for the freeze_account instruction.
#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    /// The authority freezing the account.
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

    /// The token account to freeze.
    /// CHECK: Validated by token program CPI.
    #[account(mut)]
    pub token_account: AccountInfo<'info>,

    /// Token-2022 program.
    pub token_program: Interface<'info, TokenInterface>,
}

/// Event emitted when a token account is frozen.
#[event]
pub struct AccountFrozen {
    pub config: Pubkey,
    pub token_account: Pubkey,
    pub frozen_by: Pubkey,
}

pub fn handler(ctx: Context<FreezeAccount>) -> Result<()> {
    let config = &ctx.accounts.config;
    let role_manager = &ctx.accounts.role_manager;
    let authority_key = ctx.accounts.authority.key();

    // Check authorization: master authority or pauser can freeze
    require!(
        authority_key == role_manager.master_authority || authority_key == role_manager.pauser,
        SssError::UnauthorizedMasterAuthority
    );

    // CPI: Freeze account
    let mint_key = config.mint;
    let bump = config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"config", mint_key.as_ref(), &[bump]]];

    let cpi_accounts = FreezeAccountCpi {
        account: ctx.accounts.token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.config.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );

    token_interface::freeze_account(cpi_ctx)?;

    emit!(AccountFrozen {
        config: config.key(),
        token_account: ctx.accounts.token_account.key(),
        frozen_by: authority_key,
    });

    Ok(())
}
