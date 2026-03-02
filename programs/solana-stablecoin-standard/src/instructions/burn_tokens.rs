use anchor_lang::prelude::*;
use anchor_spl::token_2022::{burn, Burn};
use anchor_spl::token_interface::TokenInterface;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::error::SssError;
use crate::state::*;

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    /// Must be the authorized burner
    pub burner: Signer<'info>,

    /// The Token-2022 mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Stablecoin config PDA
    #[account(
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    /// Roles config PDA
    #[account(
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    /// Source token account to burn from
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub source: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);
    require!(!ctx.accounts.stablecoin_config.paused, SssError::TransfersPaused);

    let roles = &ctx.accounts.roles_config;
    let caller = ctx.accounts.burner.key();

    require!(
        caller == roles.burner || caller == roles.master_authority,
        SssError::Unauthorized
    );

    let cpi_accounts = Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.source.to_account_info(),
        authority: ctx.accounts.burner.to_account_info(),
    };
    burn(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        amount,
    )?;

    msg!("Burned {} tokens from {}", amount, ctx.accounts.source.key());
    Ok(())
}
