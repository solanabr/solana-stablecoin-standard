use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use spl_token_2022::extension::ExtensionType;
use spl_token_2022::instruction::initialize_mint2;
use spl_token_2022::extension::metadata_pointer::instruction::initialize as init_metadata_pointer;
use spl_token_2022::extension::transfer_hook::instruction::initialize as init_transfer_hook;
use spl_token_2022::extension::default_account_state::instruction::initialize_default_account_state;
use spl_token_2022::extension::confidential_transfer::instruction::initialize_mint as init_confidential_transfer_mint;
use spl_token_2022::state::AccountState;


use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::StablecoinInitialized;
use crate::state::{StablecoinConfig, StablecoinConfigInput};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The mint account — must be a fresh signer keypair from the client
    #[account(mut)]
    pub mint: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::LEN,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: Transfer hook program, validated if compliance_enabled
    pub transfer_hook_program: Option<UncheckedAccount<'info>>,

    pub system_program: Program<'info, System>,
    /// CHECK: Token-2022 program
    #[account(address = anchor_spl::token_2022::ID)]
    pub token_2022_program: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, input: StablecoinConfigInput) -> Result<()> {
    require!(input.name.len() <= MAX_NAME_LEN, StablecoinError::NameTooLong);
    require!(input.symbol.len() <= MAX_SYMBOL_LEN, StablecoinError::SymbolTooLong);
    require!(input.uri.len() <= MAX_URI_LEN, StablecoinError::UriTooLong);
    require!(input.decimals <= 9, StablecoinError::InvalidDecimals);

    // Allowlist requires compliance
    if input.enable_allowlist {
        require!(input.compliance_enabled, StablecoinError::ComplianceNotEnabled);
    }

    let mint_key = ctx.accounts.mint.key();
    let config_key = ctx.accounts.config.key();
    let config_bump = ctx.bumps.config;

    // Build extension list based on config
    let mut extensions = vec![
        ExtensionType::MetadataPointer,
    ];

    if input.compliance_enabled {
        extensions.push(ExtensionType::PermanentDelegate);
        extensions.push(ExtensionType::TransferHook);
        extensions.push(ExtensionType::DefaultAccountState);
    }

    // SSS-3: Add ConfidentialTransferMint extension for privacy-enabled stablecoins
    if input.enable_allowlist {
        extensions.push(ExtensionType::ConfidentialTransferMint);
    }

    // Calculate space needed for mint + extensions + metadata
    let metadata_len: usize = 4 + 4 + 32 + 32
        + 4 + input.name.len()
        + 4 + input.symbol.len()
        + 4 + input.uri.len()
        + 4;

    // Calculate space needed for mint + extensions (WITHOUT metadata content)
    let mint_size = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(
        &extensions,
    ).map_err(|_| StablecoinError::MathOverflow)?;

    // Pre-fund enough lamports for the eventual full size (after metadata init reallocs)
    let lamports = ctx.accounts.rent.minimum_balance(mint_size + metadata_len);

    let config_seeds: &[&[u8]] = &[
        CONFIG_SEED,
        mint_key.as_ref(),
        &[config_bump],
    ];

    // Create the mint account with extension space only (mint is a Signer, not a PDA).
    invoke_signed(
        &system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &mint_key,
            lamports,
            mint_size as u64,
            &anchor_spl::token_2022::ID,
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[],
    )?;

    // Initialize MetadataPointer extension (must be before InitializeMint)
    let init_meta_ptr_ix = init_metadata_pointer(
        &anchor_spl::token_2022::ID,
        &mint_key,
        Some(config_key),
        Some(mint_key),
    )?;
    invoke_signed(
        &init_meta_ptr_ix,
        &[ctx.accounts.mint.to_account_info()],
        &[],
    )?;

    // Initialize SSS-2 extensions if compliance enabled
    let transfer_hook_program_id = if input.compliance_enabled {
        // PermanentDelegate extension
        let init_perm_delegate_ix = spl_token_2022::instruction::initialize_permanent_delegate(
            &anchor_spl::token_2022::ID,
            &mint_key,
            &config_key,
        )?;
        invoke_signed(
            &init_perm_delegate_ix,
            &[ctx.accounts.mint.to_account_info()],
            &[],
        )?;

        // TransferHook extension
        let hook_program_id = ctx.accounts.transfer_hook_program
            .as_ref()
            .map(|p| p.key())
            .unwrap_or_default();

        let init_hook_ix = init_transfer_hook(
            &anchor_spl::token_2022::ID,
            &mint_key,
            Some(config_key),
            Some(hook_program_id),
        )?;
        invoke_signed(
            &init_hook_ix,
            &[ctx.accounts.mint.to_account_info()],
            &[],
        )?;

        // DefaultAccountState extension (frozen by default for SSS-2)
        let init_default_state_ix = initialize_default_account_state(
            &anchor_spl::token_2022::ID,
            &mint_key,
            &AccountState::Frozen,
        )?;
        invoke_signed(
            &init_default_state_ix,
            &[ctx.accounts.mint.to_account_info()],
            &[],
        )?;

        hook_program_id
    } else {
        Pubkey::default()
    };

    // Initialize ConfidentialTransferMint extension for SSS-3 privacy
    if input.enable_allowlist {
        let init_ct_ix = init_confidential_transfer_mint(
            &anchor_spl::token_2022::ID,
            &mint_key,
            Some(config_key),    // CT authority = config PDA
            true,                // auto_approve_new_accounts
            None,                // no auditor ElGamal pubkey
        )?;
        invoke_signed(
            &init_ct_ix,
            &[ctx.accounts.mint.to_account_info()],
            &[],
        )?;
    }

    // Initialize the mint (config PDA is mint authority + freeze authority)
    let init_mint_ix = initialize_mint2(
        &anchor_spl::token_2022::ID,
        &mint_key,
        &config_key,       // mint authority
        Some(&config_key), // freeze authority
        input.decimals,
    )?;
    invoke_signed(
        &init_mint_ix,
        &[ctx.accounts.mint.to_account_info()],
        &[],
    )?;

    // Initialize token metadata on the mint itself
    let init_metadata_ix = spl_token_metadata_interface::instruction::initialize(
        &anchor_spl::token_2022::ID,
        &mint_key,
        &config_key,     // update authority
        &mint_key,       // mint
        &config_key,     // mint authority signs
        input.name.clone(),
        input.symbol.clone(),
        input.uri.clone(),
    );
    invoke_signed(
        &init_metadata_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        &[config_seeds],
    )?;

    let supply_cap = input.supply_cap.unwrap_or(0);

    // Set config state
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.pending_authority = Pubkey::default();
    config.mint = mint_key;
    config.transfer_hook_program = transfer_hook_program_id;
    config.paused = false;
    config.compliance_enabled = input.compliance_enabled;
    config.total_minted = 0;
    config.total_burned = 0;
    config.supply_cap = supply_cap;
    config.enable_allowlist = input.enable_allowlist;
    config.bump = config_bump;
    config._reserved = [0u8; 23];

    emit!(StablecoinInitialized {
        config: config.key(),
        authority: config.authority,
        mint: mint_key,
        name: input.name,
        symbol: input.symbol,
        decimals: input.decimals,
        compliance_enabled: input.compliance_enabled,
        enable_allowlist: input.enable_allowlist,
        supply_cap,
    });

    Ok(())
}
