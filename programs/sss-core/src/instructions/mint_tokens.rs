use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::error::SssError;
use crate::events::TokensMinted;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [SSS_CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SssError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Minter role PDA — its existence proves authorization.
    #[account(
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            minter.key().as_ref(),
            &[Role::Minter.as_u8()],
        ],
        bump = minter_role.bump,
    )]
    pub minter_role: Account<'info, RoleAccount>,

    #[account(
        mut,
        constraint = config.mint == mint.key() @ SssError::MintMismatch,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler_mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);

    // Capture account infos before mutable borrow of config
    let config_info = ctx.accounts.config.to_account_info();
    let mint_info = ctx.accounts.mint.to_account_info();
    let to_info = ctx.accounts.to.to_account_info();
    let token_program_info = ctx.accounts.token_program.to_account_info();
    let mint_key = ctx.accounts.mint.key();
    let to_key = ctx.accounts.to.key();
    let minter_key = ctx.accounts.minter.key();

    let config = &mut ctx.accounts.config;
    require!(config.can_mint(amount), SssError::SupplyCapExceeded);

    config.total_minted = config
        .total_minted
        .checked_add(amount)
        .ok_or(SssError::ArithmeticOverflow)?;

    let signer_seeds: &[&[&[u8]]] = &[&[
        SSS_CONFIG_SEED,
        mint_key.as_ref(),
        &[config.bump],
    ]];

    let cpi_accounts = MintTo {
        mint: mint_info,
        to: to_info,
        authority: config_info,
    };
    let cpi_ctx = CpiContext::new(token_program_info, cpi_accounts)
        .with_signer(signer_seeds);

    token_interface::mint_to(cpi_ctx, amount)?;

    emit!(TokensMinted {
        mint: mint_key,
        to: to_key,
        amount,
        minter: minter_key,
        new_supply: config.current_supply(),
    });

    Ok(())
}
