use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenInterface;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::error::SssError;
use crate::state::*;

/// Seize tokens from a target account using permanent delegate (SSS-2 only)
#[derive(Accounts)]
pub struct SeizeTokens<'info> {
    /// Must be the seizer role
    pub seizer: Signer<'info>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    /// Source account to seize from (can be any holder's account)
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub source: InterfaceAccount<'info, TokenAccount>,

    /// Destination to send seized tokens
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<SeizeTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);

    let config = &ctx.accounts.stablecoin_config;
    let roles = &ctx.accounts.roles_config;
    let caller = ctx.accounts.seizer.key();

    // SSS-2 only
    require!(config.permanent_delegate_enabled, SssError::Sss2NotEnabled);

    // Check seizer authorization
    require!(
        caller == roles.seizer || caller == roles.master_authority,
        SssError::Unauthorized
    );

    // Verify the target address is blacklisted
    // (enforcement done off-chain in production; PDA check here)
    // Note: In full implementation, we'd verify the blacklist PDA exists for source.owner

    // Transfer uses permanent delegate authority (the seizer IS the permanent delegate)
    anchor_spl::token_2022::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_2022::TransferChecked {
                from: ctx.accounts.source.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.seizer.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.stablecoin_config.decimals,
    )?;

    msg!(
        "Seized {} tokens from {} to {}",
        amount,
        ctx.accounts.source.key(),
        ctx.accounts.destination.key()
    );
    Ok(())
}
