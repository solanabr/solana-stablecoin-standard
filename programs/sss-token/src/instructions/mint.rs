use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use spl_token_2022::instruction as t22_ix;

use crate::errors::SssError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct MintParams {
    pub amount: u64,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
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

    /// Destination token account. Must already exist (we don't create ATAs in mint).
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<MintTokens>, params: MintParams) -> Result<()> {
    let config = &ctx.accounts.config;
    let role = &ctx.accounts.role;

    require!(!config.paused, SssError::Paused);
    require!(role.has_role(role_flags::MINTER), SssError::Unauthorized);

    // Check supply cap
    if config.supply_cap > 0 {
        let current_supply = ctx.accounts.mint.supply;
        let new_supply = current_supply
            .checked_add(params.amount)
            .ok_or(SssError::Overflow)?;
        require!(new_supply <= config.supply_cap, SssError::SupplyCapExceeded);
    }

    // Mint via CPI — config PDA is the mint authority
    let mint_key = config.mint;
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"sss_config",
        mint_key.as_ref(),
        &[config.bump],
    ]];

    anchor_lang::solana_program::program::invoke_signed(
        &t22_ix::mint_to(
            ctx.accounts.token_program.key,
            &ctx.accounts.mint.key(),
            &ctx.accounts.destination.key(),
            &ctx.accounts.config.key(),
            &[],
            params.amount,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.destination.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        signer_seeds,
    )?;

    msg!(
        "Minted {} to {} (supply_cap={})",
        params.amount,
        ctx.accounts.destination.key(),
        config.supply_cap
    );
    Ok(())
}
