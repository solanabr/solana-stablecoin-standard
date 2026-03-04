use anchor_lang::{
    prelude::*,
    solana_program,
    system_program::{create_account, CreateAccount},
};
use anchor_spl::token_2022::Token2022;
use spl_pod::optional_keys::OptionalNonZeroPubkey;
use spl_token_2022::{
    extension::{
        default_account_state::instruction::initialize_default_account_state,
        metadata_pointer::instruction::initialize as initialize_metadata_pointer,
        transfer_hook::instruction::initialize as initialize_transfer_hook_extension,
        ExtensionType,
    },
    instruction::{initialize_mint2, initialize_permanent_delegate},
    state::AccountState,
};
use spl_token_metadata_interface::{
    instruction::initialize as initialize_metadata,
    state::TokenMetadata,
};

use crate::{
    error::StablecoinError,
    events::StablecoinInitialized,
    state::{StablecoinConfig, CONFIG_SEED},
};

// Maximum metadata field string lengths.
const MAX_NAME_LEN: usize = 32;
const MAX_SYMBOL_LEN: usize = 10;
const MAX_URI_LEN: usize = 200;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    /// Enable SSS-2 permanent delegate extension.
    pub enable_permanent_delegate: bool,
    /// Enable SSS-2 transfer hook extension.
    pub enable_transfer_hook: bool,
    /// Newly created token accounts default to Frozen (SSS-2).
    pub default_account_frozen: bool,
    /// Required when enable_transfer_hook is true.
    pub hook_program_id: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    /// The master authority that will own the stablecoin configuration.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Config PDA — program-owned, governs the mint.
    ///
    /// Seeds: [b"config", mint.key()]
    /// The mint key is known before initialisation because `mint` is a
    /// keypair account whose public key is fixed by the signer.
    #[account(
        init,
        payer = authority,
        space = 8 + StablecoinConfig::INIT_SPACE,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Token-2022 mint — must be a fresh keypair signer.
    ///
    /// We allocate and initialise this account manually via CPI so that
    /// we can call extension initialisers *before* `InitializeMint`.
    /// Anchor's `init` macro cannot handle the variable-length mint layout
    /// required by Token-2022 extensions, so we manage space ourselves.
    #[account(mut)]
    pub mint: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    // ── 0. Validate inputs ────────────────────────────────────────────────
    require!(params.name.len() <= MAX_NAME_LEN, StablecoinError::StringTooLong);
    require!(params.symbol.len() <= MAX_SYMBOL_LEN, StablecoinError::StringTooLong);
    require!(params.uri.len() <= MAX_URI_LEN, StablecoinError::StringTooLong);

    if params.enable_transfer_hook {
        require!(
            params.hook_program_id.is_some(),
            StablecoinError::NoTransferHook
        );
    }

    let mint_key = ctx.accounts.mint.key();
    let authority_key = ctx.accounts.authority.key();
    let config_bump = ctx.bumps.config;
    let config_key = ctx.accounts.config.key();
    let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config_bump]];

    // ── 1. Compute required mint account size ─────────────────────────────
    let mut extension_types: Vec<ExtensionType> = vec![
        // MetadataPointer is always present — self-hosted token metadata.
        ExtensionType::MetadataPointer,
    ];
    if params.enable_permanent_delegate {
        extension_types.push(ExtensionType::PermanentDelegate);
    }
    if params.enable_transfer_hook {
        extension_types.push(ExtensionType::TransferHook);
    }
    if params.default_account_frozen {
        extension_types.push(ExtensionType::DefaultAccountState);
    }

    let mint_size =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extension_types)
            .map_err(|_| StablecoinError::MathOverflow)?;

    // Build the metadata struct to compute its TLV-encoded size so we can
    // allocate enough lamports in the single create_account call.
    let metadata = TokenMetadata {
        update_authority: OptionalNonZeroPubkey::try_from(Some(authority_key))
            .map_err(|_| StablecoinError::Unauthorized)?,
        mint: mint_key,
        name: params.name.clone(),
        symbol: params.symbol.clone(),
        uri: params.uri.clone(),
        ..Default::default()
    };
    let metadata_size =
        spl_token_metadata_interface::state::TokenMetadata::tlv_size_of(&metadata)
            .map_err(|_| StablecoinError::MathOverflow)?;

    let total_size = mint_size
        .checked_add(metadata_size)
        .ok_or(StablecoinError::MathOverflow)?;

    // ── 2. Allocate the mint account via System Program CPI ───────────────
    //
    // IMPORTANT: We allocate only `mint_size` bytes (extension headers only),
    // because `InitializeMint2` strictly checks that:
    //   account.data_len() == ExtensionType::try_calculate_account_len(&extensions)
    //
    // However, we fund the account with lamports sufficient for `total_size`
    // (mint extensions + inline metadata TLV bytes).  This pre-funds the
    // rent-exemption so that the subsequent `initialize_metadata` CPI can
    // `realloc` the account up to `total_size` without needing an extra
    // lamport transfer.
    let lamports = ctx.accounts.rent.minimum_balance(total_size);

    create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        lamports,
        mint_size as u64, // data len = mint_size; InitializeMint2 validates this
        &spl_token_2022::ID,
    )?;

    // ── 3. Initialize extensions BEFORE InitializeMint ───────────────────
    //
    // Token-2022 mandates: extension initialisers MUST run before
    // InitializeMint2.  The order of extensions relative to each other
    // does not matter, but they must all precede the mint initialisation.

    // 3a. MetadataPointer — self-referential: metadata lives inside the mint.
    {
        let ix = initialize_metadata_pointer(
            &spl_token_2022::ID,
            &mint_key,
            Some(authority_key), // update authority for the metadata
            Some(mint_key),      // metadata account == mint itself
        )
        .map_err(|_| StablecoinError::MathOverflow)?;

        solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.authority.to_account_info(),
            ],
        )?;
    }

    // 3b. PermanentDelegate — config PDA is the delegate so the program
    //     can CPI-sign seize/burn operations on any account.
    if params.enable_permanent_delegate {
        let ix = initialize_permanent_delegate(&spl_token_2022::ID, &mint_key, &config_key)
            .map_err(|_| StablecoinError::MathOverflow)?;

        solana_program::program::invoke(
            &ix,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // 3c. TransferHook — point to the compliance hook program.
    if params.enable_transfer_hook {
        let hook_pid = params.hook_program_id.unwrap(); // validated at top
        let ix = initialize_transfer_hook_extension(
            &spl_token_2022::ID,
            &mint_key,
            Some(authority_key),
            Some(hook_pid),
        )
        .map_err(|_| StablecoinError::MathOverflow)?;

        solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.authority.to_account_info(),
            ],
        )?;
    }

    // 3d. DefaultAccountState — newly opened accounts start frozen.
    if params.default_account_frozen {
        let ix = initialize_default_account_state(
            &spl_token_2022::ID,
            &mint_key,
            &AccountState::Frozen,
        )
        .map_err(|_| StablecoinError::MathOverflow)?;

        solana_program::program::invoke(
            &ix,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // ── 4. Initialize the mint ────────────────────────────────────────────
    //
    // Mint authority and freeze authority are both the config PDA.
    // This means all privileged token operations require a CPI signed with
    // the config PDA seeds — the program is the sole key-holder.
    {
        let ix = initialize_mint2(
            &spl_token_2022::ID,
            &mint_key,
            &config_key,       // mint authority = config PDA
            Some(&config_key), // freeze authority = config PDA
            params.decimals,
        )
        .map_err(|_| StablecoinError::MathOverflow)?;

        solana_program::program::invoke(
            &ix,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // ── 5. Initialize token metadata ──────────────────────────────────────
    //
    // The metadata is self-hosted: stored inside the mint account itself.
    // We sign with the config PDA because the mint authority must authorise
    // the metadata initialisation.
    {
        let ix = initialize_metadata(
            &spl_token_2022::ID,
            &mint_key,       // metadata account == mint
            &authority_key,  // update authority (the human operator)
            &mint_key,       // mint
            &config_key,     // mint authority (must sign → config PDA signer seeds)
            params.name.clone(),
            params.symbol.clone(),
            params.uri.clone(),
        );

        solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.config.to_account_info(),
            ],
            &[config_seeds],
        )?;
    }

    // ── 6. Persist StablecoinConfig ───────────────────────────────────────
    let config = &mut ctx.accounts.config;
    config.authority = authority_key;
    config.pending_authority = None;
    config.mint = mint_key;
    config.paused = false;
    config.enable_permanent_delegate = params.enable_permanent_delegate;
    config.enable_transfer_hook = params.enable_transfer_hook;
    config.default_account_frozen = params.default_account_frozen;
    config.hook_program_id = params.hook_program_id;
    config.bump = config_bump;
    config._reserved = [0u8; 64];

    // ── 7. Emit event ─────────────────────────────────────────────────────
    let preset = if params.enable_permanent_delegate || params.enable_transfer_hook {
        "sss-2".to_string()
    } else {
        "sss-1".to_string()
    };

    emit!(StablecoinInitialized {
        mint: mint_key,
        authority: authority_key,
        preset,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
