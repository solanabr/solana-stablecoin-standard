use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::constants::*;
use crate::error::SSSError;
use crate::events::StablecoinInitialized;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub supply_cap: u64,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::LEN,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = RoleAccount::LEN,
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub authority_roles: Account<'info, RoleAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(params.name.len() <= MAX_NAME_LEN, SSSError::NameTooLong);
    require!(params.symbol.len() <= MAX_SYMBOL_LEN, SSSError::SymbolTooLong);
    require!(params.uri.len() <= MAX_URI_LEN, SSSError::UriTooLong);
    require!(params.decimals <= 9, SSSError::InvalidDecimals);

    let config = &mut ctx.accounts.stablecoin_config;
    config.authority = ctx.accounts.authority.key();
    config.pending_authority = None;
    config.mint = ctx.accounts.mint.key();
    config.name = params.name.clone();
    config.symbol = params.symbol.clone();
    config.uri = params.uri.clone();
    config.decimals = params.decimals;
    config.enable_permanent_delegate = params.enable_permanent_delegate;
    config.enable_transfer_hook = params.enable_transfer_hook;
    config.default_account_frozen = params.default_account_frozen;
    config.paused = false;
    config.supply_cap = params.supply_cap;
    config.total_minted = 0;
    config.total_burned = 0;
    config.bump = ctx.bumps.stablecoin_config;
    config._reserved = [0u8; 64];

    let clock = Clock::get()?;
    let roles = &mut ctx.accounts.authority_roles;
    roles.stablecoin = config.key();
    roles.holder = ctx.accounts.authority.key();
    roles.roles = Role::MINTER
        | Role::BURNER
        | Role::PAUSER
        | Role::FREEZER
        | Role::BLACKLISTER
        | Role::SEIZER;
    roles.granted_by = ctx.accounts.authority.key();
    roles.last_modified = clock.unix_timestamp;
    roles.active = true;
    roles.bump = ctx.bumps.authority_roles;

    emit!(StablecoinInitialized {
        mint: config.mint,
        authority: config.authority,
        name: params.name,
        symbol: params.symbol,
        decimals: params.decimals,
        supply_cap: params.supply_cap,
        enable_permanent_delegate: params.enable_permanent_delegate,
        enable_transfer_hook: params.enable_transfer_hook,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
