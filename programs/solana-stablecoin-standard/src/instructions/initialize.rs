use anchor_lang::prelude::*;

use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::constants::*;
use crate::error::SssError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeParams {
    /// Token name
    pub name: String,
    /// Token symbol (e.g. "USDC")
    pub symbol: String,
    /// Metadata URI
    pub uri: String,
    /// Decimal places (0-9)
    pub decimals: u8,
    /// Maximum supply (0 = unlimited)
    pub max_supply: u64,
    /// Preset: 0 = SSS-1, 1 = SSS-2
    pub preset: u8,
    /// Initial minter (defaults to authority if Pubkey::default())
    pub minter: Option<Pubkey>,
    /// Optional minter quota (0 = unlimited)
    pub minter_quota: u64,
    /// Optional burner (defaults to authority if None)
    pub burner: Option<Pubkey>,
    /// Optional blacklister for SSS-2 (defaults to authority if None)
    pub blacklister: Option<Pubkey>,
    /// Optional pauser (defaults to authority if None)
    pub pauser: Option<Pubkey>,
    /// Optional seizer for SSS-2 (defaults to authority if None)
    pub seizer: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    /// Master authority — pays for initialization and holds top-level control
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The Token-2022 mint account (created externally or in CPI)
    /// For SSS-1: must have MetadataPointer, MintCloseAuthority, FreezeAuthority
    /// For SSS-2: additionally PermanentDelegate, TransferHook
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Stablecoin config PDA
    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::LEN,
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    /// Roles config PDA
    #[account(
        init,
        payer = authority,
        space = RolesConfig::LEN,
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub roles_config: Account<'info, RolesConfig>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(params.decimals <= 9, SssError::InvalidDecimals);
    require!(params.name.len() <= MAX_NAME_LEN, SssError::InvalidPreset);
    require!(params.symbol.len() <= MAX_SYMBOL_LEN, SssError::InvalidPreset);
    require!(params.uri.len() <= MAX_URI_LEN, SssError::InvalidPreset);

    let preset = match params.preset {
        0 => Preset::Sss1,
        1 => Preset::Sss2,
        _ => Preset::Custom,
    };

    let sss2_enabled = preset == Preset::Sss2;

    // Initialize stablecoin config
    let config = &mut ctx.accounts.stablecoin_config;
    config.mint = ctx.accounts.mint.key();
    config.preset = preset;
    config.paused = false;
    config.max_supply = params.max_supply;
    config.decimals = params.decimals;
    config.permanent_delegate_enabled = sss2_enabled;
    config.transfer_hook_enabled = sss2_enabled;
    config.bump = ctx.bumps.stablecoin_config;

    // Initialize roles config
    let authority_key = ctx.accounts.authority.key();
    let roles = &mut ctx.accounts.roles_config;
    roles.mint = ctx.accounts.mint.key();
    roles.master_authority = authority_key;
    roles.minter = params.minter.unwrap_or(authority_key);
    roles.minter_quota = params.minter_quota;
    roles.minted_this_epoch = 0;
    roles.burner = params.burner.unwrap_or(authority_key);
    roles.blacklister = if sss2_enabled {
        params.blacklister.unwrap_or(authority_key)
    } else {
        Pubkey::default()
    };
    roles.pauser = params.pauser.unwrap_or(authority_key);
    roles.seizer = if sss2_enabled {
        params.seizer.unwrap_or(authority_key)
    } else {
        Pubkey::default()
    };
    roles.bump = ctx.bumps.roles_config;

    msg!(
        "SSS initialized: preset={}, mint={}, authority={}",
        params.preset,
        ctx.accounts.mint.key(),
        authority_key
    );

    Ok(())
}
