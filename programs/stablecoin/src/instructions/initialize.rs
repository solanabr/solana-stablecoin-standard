use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, program::invoke_signed, system_instruction};
use anchor_spl::token_2022::spl_token_2022::{
    self,
    extension::{
        metadata_pointer, transfer_hook as th_ext, ExtensionType,
    },
    instruction as token_instruction,
};
use spl_token_metadata_interface::instruction as metadata_instruction;

use crate::errors::StablecoinError;
use crate::state::{FeatureFlags, Preset, StablecoinConfig};
use crate::state::roles::RoleAssignment;

/// Parameters for initializing a new stablecoin.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeParams {
    pub preset: Preset,
    pub custom_features: Option<FeatureFlags>,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub transfer_hook_program: Option<Pubkey>,
    /// Whether new token accounts should be frozen by default (KYC gating).
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
        seeds = [b"stablecoin-config", mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: We initialize this manually via CPI to token-2022 with extensions.
    #[account(mut)]
    pub mint: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = RoleAssignment::LEN,
        seeds = [b"role", config.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub authority_role: Account<'info, RoleAssignment>,

    /// CHECK: Validated by address constraint.
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    // ── Validate inputs ──────────────────────────────────────────
    require!(params.name.len() <= 32, StablecoinError::NameTooLong);
    require!(params.symbol.len() <= 10, StablecoinError::SymbolTooLong);
    require!(params.decimals <= 18, StablecoinError::InvalidDecimals);

    let features = match params.preset {
        Preset::SSS1 => FeatureFlags::sss1(),
        Preset::SSS2 => FeatureFlags::sss2(),
        Preset::Custom => params
            .custom_features
            .ok_or(StablecoinError::InvalidPreset)?,
    };

    if features.transfer_hook {
        require!(
            params.transfer_hook_program.is_some(),
            StablecoinError::TransferHookRequired
        );
    }

    // ── Determine required extensions ────────────────────────────
    let mut extension_types = vec![ExtensionType::MetadataPointer];

    if features.permanent_delegate {
        extension_types.push(ExtensionType::PermanentDelegate);
    }
    if features.transfer_hook {
        extension_types.push(ExtensionType::TransferHook);
    }
    if features.confidential_transfers {
        extension_types.push(ExtensionType::ConfidentialTransferMint);
    }

    // Account for the token metadata TLV payload space.
    // The metadata extension stores data as TLV within the mint account.
    let base_size =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extension_types)
            .map_err(|_| StablecoinError::InvalidPreset)?;

    // Token metadata init will reallocate for TLV payload.


    let mint_account_size = base_size;
    let metadata_space = 256 + params.name.len() + params.symbol.len() + params.uri.len();

    let rent = &ctx.accounts.rent;
    let lamports = rent.minimum_balance(mint_account_size + metadata_space);

    // ── Create the mint account ──────────────────────────────────
    invoke(
        &system_instruction::create_account(
            ctx.accounts.authority.key,
            ctx.accounts.mint.key,
            lamports,
            mint_account_size as u64,
            &spl_token_2022::ID,
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // ── Initialize extensions BEFORE InitializeMint ──────────────

    // Metadata pointer → points to the mint itself (on-chain metadata)
    invoke(
        &metadata_pointer::instruction::initialize(
            &spl_token_2022::ID,
            ctx.accounts.mint.key,
            Some(ctx.accounts.config.key()),
            Some(*ctx.accounts.mint.key),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // Permanent delegate (SSS-2): config PDA is the delegate
    if features.permanent_delegate {
        let config_key = ctx.accounts.config.key();
        invoke(
            &token_instruction::initialize_permanent_delegate(
                &spl_token_2022::ID,
                ctx.accounts.mint.key,
                &config_key,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // Transfer hook (SSS-2)
    if features.transfer_hook {
        let hook_program_id = params.transfer_hook_program.unwrap();
        invoke(
            &th_ext::instruction::initialize(
                &spl_token_2022::ID,
                ctx.accounts.mint.key,
                Some(ctx.accounts.config.key()),
                Some(hook_program_id),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // ── Initialize the mint ──────────────────────────────────────
    let freeze_authority = if features.freeze_authority {
        Some(ctx.accounts.config.key())
    } else {
        None
    };

    invoke(
        &token_instruction::initialize_mint2(
            &spl_token_2022::ID,
            ctx.accounts.mint.key,
            &ctx.accounts.config.key(), // mint authority = config PDA
            freeze_authority.as_ref(),
            params.decimals,
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // ── Initialize on-chain token metadata ───────────────────────
    // The metadata update authority is the config PDA, so we need invoke_signed.
    let config_seeds: &[&[u8]] = &[
        b"stablecoin-config",
        ctx.accounts.mint.key.as_ref(),
        &[ctx.bumps.config],
    ];

    invoke_signed(
        &metadata_instruction::initialize(
            &spl_token_2022::ID,
            ctx.accounts.mint.key,
            &ctx.accounts.config.key(), // update authority
            ctx.accounts.mint.key,      // mint
            &ctx.accounts.config.key(), // mint authority (config PDA)
            params.name.clone(),
            params.symbol.clone(),
            params.uri,
        ),
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        &[config_seeds],
    )?;

    // ── Populate config PDA ──────────────────────────────────────
    let config = &mut ctx.accounts.config;
    config.bump = ctx.bumps.config;
    config.mint = ctx.accounts.mint.key();
    config.authority = ctx.accounts.authority.key();
    config.preset = params.preset;
    config.features = features;
    config.paused = false;
    config.default_account_frozen = params.default_account_frozen;
    config.total_minted = 0;
    config.total_burned = 0;
    config.decimals = params.decimals;

    let mut name_bytes = [0u8; 32];
    let name_slice = params.name.as_bytes();
    name_bytes[..name_slice.len()].copy_from_slice(name_slice);
    config.name = name_bytes;

    let mut symbol_bytes = [0u8; 10];
    let symbol_slice = params.symbol.as_bytes();
    symbol_bytes[..symbol_slice.len()].copy_from_slice(symbol_slice);
    config.symbol = symbol_bytes;

    config.transfer_hook_program = params.transfer_hook_program.unwrap_or_default();

    let clock = Clock::get()?;
    config.created_at = clock.slot;
    config.updated_at = clock.slot;
    config._reserved = [0u8; 128];

    // ── Grant all roles to the initial authority ─────────────────
    let role_assignment = &mut ctx.accounts.authority_role;
    role_assignment.bump = ctx.bumps.authority_role;
    role_assignment.config = ctx.accounts.config.key();
    role_assignment.holder = ctx.accounts.authority.key();
    // Grant all roles: Minter(0) | Burner(1) | Pauser(2) | Blacklister(3) | Seizer(4)
    role_assignment.role_mask = 0b0001_1111;
    role_assignment.mint_quota = 0; // unlimited
    role_assignment.minted_amount = 0;
    role_assignment.updated_at = clock.slot;

    msg!("Stablecoin initialized: preset={:?}, mint={}", params.preset, ctx.accounts.mint.key());
    Ok(())
}
