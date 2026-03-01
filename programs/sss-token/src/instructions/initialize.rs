use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::state::StablecoinState;
use super::{StablecoinConfig, SssError};

#[derive(Accounts)]
#[instruction(config: StablecoinConfig)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + StablecoinState::INIT_SPACE,
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    /// The Token-2022 mint. Must be created beforehand with the desired extensions.
    /// CHECK: We just store the key; mint setup is done client-side for flexibility.
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(ctx: Context<Initialize>, config: StablecoinConfig) -> Result<()> {
    require!(config.name.len() <= 32, SssError::NameTooLong);
    require!(config.symbol.len() <= 10, SssError::SymbolTooLong);
    require!(config.uri.len() <= 200, SssError::UriTooLong);

    let state = &mut ctx.accounts.stablecoin_state;
    state.mint = ctx.accounts.mint.key();
    state.master_authority = ctx.accounts.authority.key();
    state.pending_authority = None;
    state.name = config.name;
    state.symbol = config.symbol;
    state.uri = config.uri;
    state.decimals = config.decimals;
    state.compliance_enabled = config.enable_permanent_delegate || config.enable_transfer_hook;
    state.permanent_delegate_enabled = config.enable_permanent_delegate;
    state.transfer_hook_enabled = config.enable_transfer_hook;
    state.default_account_frozen = config.default_account_frozen;
    state.paused = false;
    state.minter_count = 0;
    state.bump = ctx.bumps.stablecoin_state;

    msg!(
        "SSS: Initialized stablecoin '{}' ({}), compliance={}",
        state.name,
        state.symbol,
        state.compliance_enabled
    );

    Ok(())
}
