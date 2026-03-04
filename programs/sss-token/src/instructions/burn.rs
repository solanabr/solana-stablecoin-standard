use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use spl_token_2022::instruction as t22_ix;

use crate::errors::SssError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BurnParams {
    pub amount: u64,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"sss_config", mint.key().as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, TokenConfig>,

    #[account(
        seeds = [b"sss_role", config.key().as_ref(), authority.key().as_ref()],
        bump = role.bump,
        constraint = role.config == config.key(),
        constraint = role.authority == authority.key(),
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token account to burn from. Authority must be the account owner.
    #[account(
        mut,
        token::mint = mint,
        token::authority = authority,
        token::token_program = token_program,
    )]
    pub source: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<BurnTokens>, params: BurnParams) -> Result<()> {
    let config = &ctx.accounts.config;
    let role = &ctx.accounts.role;

    require!(!config.paused, SssError::Paused);
    require!(role.has_role(role_flags::BURNER), SssError::Unauthorized);

    // Burn via CPI — the authority signs directly (they own the token account)
    anchor_lang::solana_program::program::invoke(
        &t22_ix::burn(
            ctx.accounts.token_program.key,
            &ctx.accounts.source.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.authority.key(),
            &[],
            params.amount,
        )?,
        &[
            ctx.accounts.source.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
    )?;

    msg!("Burned {} from {}", params.amount, ctx.accounts.source.key());
    Ok(())
}
