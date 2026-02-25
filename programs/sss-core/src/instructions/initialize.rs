use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::constants::*;
use crate::error::SssError;
use crate::events::StablecoinInitialized;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeArgs {
    pub preset: u8,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub supply_cap: Option<u64>,
    /// Override preset default for permanent delegate. If None, derived from preset.
    pub enable_permanent_delegate: Option<bool>,
    /// Override preset default for transfer hook. If None, derived from preset.
    pub enable_transfer_hook: Option<bool>,
    /// Override preset default for default-frozen accounts. If None, derived from preset.
    pub default_account_frozen: Option<bool>,
}

#[derive(Accounts)]
#[instruction(args: InitializeArgs)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = CONFIG_SPACE,
        seeds = [SSS_CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The Token-2022 mint, created externally by the SDK before this instruction.
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = ROLE_SPACE,
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            authority.key().as_ref(),
            &[Role::Admin.as_u8()],
        ],
        bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler_initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    require!(
        args.preset >= 1 && args.preset <= 3,
        SssError::InvalidPreset
    );
    require!(args.name.len() <= 32, SssError::NameTooLong);
    require!(args.symbol.len() <= 10, SssError::SymbolTooLong);
    require!(args.uri.len() <= 200, SssError::UriTooLong);

    // Derive feature flags from preset, allowing explicit overrides
    let (default_perm_delegate, default_hook, default_frozen) = match args.preset {
        1 => (true, false, false),  // SSS-1: minimal
        2 => (true, true, true),    // SSS-2: compliant (hook + frozen by default)
        3 => (true, false, false),  // SSS-3: private (confidential transfers, no hook)
        _ => unreachable!(),        // already validated above
    };

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.preset = args.preset;
    config.paused = false;
    config.supply_cap = args.supply_cap;
    config.total_minted = 0;
    config.total_burned = 0;
    config.bump = ctx.bumps.config;
    config.name = args.name;
    config.symbol = args.symbol;
    config.uri = args.uri;
    config.decimals = args.decimals;
    config.enable_permanent_delegate = args.enable_permanent_delegate.unwrap_or(default_perm_delegate);
    config.enable_transfer_hook = args.enable_transfer_hook.unwrap_or(default_hook);
    config.default_account_frozen = args.default_account_frozen.unwrap_or(default_frozen);
    config._reserved = [0u8; 32];

    let admin_role = &mut ctx.accounts.admin_role;
    admin_role.config = config.key();
    admin_role.address = ctx.accounts.authority.key();
    admin_role.role = Role::Admin;
    admin_role.granted_by = ctx.accounts.authority.key();
    admin_role.granted_at = Clock::get()?.unix_timestamp;
    admin_role.bump = ctx.bumps.admin_role;
    admin_role.mint_quota = None;
    admin_role.amount_minted = 0;

    emit!(StablecoinInitialized {
        mint: config.mint,
        authority: config.authority,
        preset: config.preset,
        supply_cap: config.supply_cap,
        name: config.name.clone(),
        symbol: config.symbol.clone(),
        decimals: config.decimals,
    });

    Ok(())
}
