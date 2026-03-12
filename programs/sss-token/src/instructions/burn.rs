use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Burn, TokenInterface};

use crate::state::{StablecoinConfig, RoleManager};
use crate::errors::SssError;

/// Accounts for the burn instruction.
#[derive(Accounts)]
pub struct BurnTokens<'info> {
    /// The burner signing the transaction.
    #[account(mut)]
    pub burner: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        mut,
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
    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: AccountInfo<'info>,

    /// The burner's token account to burn from.
    /// CHECK: Validated by token program CPI.
    #[account(mut)]
    pub burner_token_account: AccountInfo<'info>,

    /// Token-2022 program.
    pub token_program: Interface<'info, TokenInterface>,
}

/// Event emitted when tokens are burned.
#[event]
pub struct TokensBurned {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub burner: Pubkey,
    pub amount: u64,
    pub total_burned: u64,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_manager = &ctx.accounts.role_manager;

    // Check not paused
    require!(!config.is_paused, SssError::Paused);

    // Check amount
    require!(amount > 0, SssError::ZeroBurnAmount);

    // Check burner authorization
    let burner_key = ctx.accounts.burner.key();
    require!(
        role_manager.is_burner(&burner_key) || burner_key == role_manager.master_authority,
        SssError::UnauthorizedBurner
    );

    // Update total burned
    config.total_burned = config
        .total_burned
        .checked_add(amount)
        .ok_or(SssError::ArithmeticOverflow)?;

    // CPI: Burn tokens
    let cpi_accounts = Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.burner_token_account.to_account_info(),
        authority: ctx.accounts.burner.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );

    token_interface::burn(cpi_ctx, amount)?;

    emit!(TokensBurned {
        config: config.key(),
        mint: config.mint,
        burner: burner_key,
        amount,
        total_burned: config.total_burned,
    });

    Ok(())
}
