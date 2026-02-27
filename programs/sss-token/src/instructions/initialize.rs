use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::token_2022::{self, spl_token_2022};
use spl_token_2022::{
    extension::{
        confidential_transfer::instruction::initialize_mint as init_ct_mint,
        metadata_pointer::instruction::initialize as init_metadata_pointer,
        ExtensionType,
    },
    instruction::initialize_mint2,
};

use crate::errors::SssError;
use crate::events::StablecoinInitialized;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub preset: StablecoinPreset,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The mint account, created in the instruction handler via CPI.
    /// We use UncheckedAccount because Token-2022 mints with extensions
    /// must be created with specific extension space before initialization.
    #[account(mut)]
    pub mint: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::SPACE,
        seeds = [StablecoinConfig::SEED_PREFIX, mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init,
        payer = authority,
        space = RoleRegistry::SPACE,
        seeds = [RoleRegistry::SEED_PREFIX, config.key().as_ref()],
        bump,
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token_2022::Token2022>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(
        params.name.len() <= StablecoinConfig::MAX_NAME_LEN,
        SssError::NameTooLong
    );
    require!(
        params.symbol.len() <= StablecoinConfig::MAX_SYMBOL_LEN,
        SssError::SymbolTooLong
    );
    require!(
        params.uri.len() <= StablecoinConfig::MAX_URI_LEN,
        SssError::UriTooLong
    );
    require!(params.decimals <= 18, SssError::InvalidDecimals);

    let clock = Clock::get()?;
    let config_key = ctx.accounts.config.key();

    // Determine feature flags based on preset
    let (enable_permanent_delegate, enable_transfer_hook, default_account_frozen, enable_ct) =
        match params.preset {
            StablecoinPreset::SSS1 => (false, false, false, false),
            StablecoinPreset::SSS2 => (true, true, false, false),
            StablecoinPreset::SSS3 => (true, false, false, true),
            StablecoinPreset::Custom => (false, false, false, false),
        };

    // Build extension list for mint space calculation
    let mut extensions = vec![ExtensionType::MetadataPointer];
    if enable_permanent_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    if enable_transfer_hook {
        extensions.push(ExtensionType::TransferHook);
    }
    if default_account_frozen {
        extensions.push(ExtensionType::DefaultAccountState);
    }
    if enable_ct {
        extensions.push(ExtensionType::ConfidentialTransferMint);
    }

    let mint_space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(
        &extensions,
    )
    .map_err(|_| SssError::Overflow)?;

    let rent = &ctx.accounts.rent;
    let lamports = rent.minimum_balance(mint_space);

    // Create the mint account
    invoke(
        &anchor_lang::solana_program::system_instruction::create_account(
            ctx.accounts.authority.key,
            ctx.accounts.mint.key,
            lamports,
            mint_space as u64,
            &token_2022::Token2022::id(),
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // Initialize metadata pointer extension (must be before mint init)
    invoke(
        &init_metadata_pointer(
            &token_2022::Token2022::id(),
            ctx.accounts.mint.key,
            Some(config_key),
            Some(ctx.accounts.mint.key()),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // Initialize permanent delegate extension if enabled
    if enable_permanent_delegate {
        invoke(
            &spl_token_2022::instruction::initialize_permanent_delegate(
                &token_2022::Token2022::id(),
                ctx.accounts.mint.key,
                &config_key,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // Initialize transfer hook extension if enabled
    // For SSS-2, the hook program ID must be passed as the first remaining account
    if enable_transfer_hook {
        let hook_program_id = ctx
            .remaining_accounts
            .first()
            .map(|a| a.key())
            .ok_or(SssError::TransferHookNotEnabled)?;

        invoke(
            &spl_token_2022::extension::transfer_hook::instruction::initialize(
                &token_2022::Token2022::id(),
                ctx.accounts.mint.key,
                Some(config_key),
                Some(hook_program_id),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // Initialize default account state extension if enabled
    if default_account_frozen {
        invoke(
            &spl_token_2022::extension::default_account_state::instruction::initialize_default_account_state(
                &token_2022::Token2022::id(),
                ctx.accounts.mint.key,
                &spl_token_2022::state::AccountState::Frozen,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // Initialize confidential transfer extension if enabled
    if enable_ct {
        invoke(
            &init_ct_mint(
                &token_2022::Token2022::id(),
                ctx.accounts.mint.key,
                Some(config_key), // CT authority = config PDA
                true,             // auto-approve new accounts
                None,             // no auditor ElGamal pubkey
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // Initialize the mint itself
    invoke(
        &initialize_mint2(
            &token_2022::Token2022::id(),
            ctx.accounts.mint.key,
            &config_key,      // mint authority = config PDA
            Some(&config_key), // freeze authority = config PDA
            params.decimals,
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // Initialize StablecoinConfig
    let config = &mut ctx.accounts.config;
    config.bump = ctx.bumps.config;
    config.mint = ctx.accounts.mint.key();
    config.master_authority = ctx.accounts.authority.key();
    config.name = params.name.clone();
    config.symbol = params.symbol.clone();
    config.uri = params.uri.clone();
    config.decimals = params.decimals;
    config.preset = params.preset;
    config.enable_permanent_delegate = enable_permanent_delegate;
    config.enable_transfer_hook = enable_transfer_hook;
    config.default_account_frozen = default_account_frozen;
    config.enable_confidential_transfers = enable_ct;
    config.is_paused = false;
    config.total_minted = 0;
    config.total_burned = 0;
    config.audit_log_index = 0;
    config.reserve_attestation_index = 0;
    config.created_at = clock.unix_timestamp;
    config.updated_at = clock.unix_timestamp;

    // Initialize RoleRegistry
    let role_registry = &mut ctx.accounts.role_registry;
    role_registry.bump = ctx.bumps.role_registry;
    role_registry.config = config.key();
    role_registry.master_authority = ctx.accounts.authority.key();
    role_registry.pauser = ctx.accounts.authority.key();
    role_registry.blacklister = if enable_permanent_delegate {
        ctx.accounts.authority.key()
    } else {
        Pubkey::default()
    };
    role_registry.seizer = if enable_permanent_delegate {
        ctx.accounts.authority.key()
    } else {
        Pubkey::default()
    };

    emit!(StablecoinInitialized {
        config: config.key(),
        mint: config.mint,
        master_authority: config.master_authority,
        name: config.name.clone(),
        symbol: config.symbol.clone(),
        preset: config.preset as u8,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
