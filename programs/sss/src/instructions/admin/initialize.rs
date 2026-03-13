use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = StablecoinConfig::LEN,
        seeds = [b"config", mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        constraint = mint.mint_authority.unwrap() == payer.key() @ StablecoinError::InvalidAuthority
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
}

pub fn initialize_handler(ctx: Context<Initialize>, enable_permanent_delegate: bool, enable_transfer_hook: bool, default_account_frozen: bool) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.mint = ctx.accounts.mint.key();
    config.master_authority = ctx.accounts.payer.key();
    config.enable_permanent_delegate = enable_permanent_delegate;
    config.enable_transfer_hook = enable_transfer_hook;
    config.default_account_frozen = default_account_frozen;
    config.enable_confidential_transfers = false; // Placeholder for SSS-3
    config.is_paused = false;
    config.bump = ctx.bumps.config;
    Ok(())
}
