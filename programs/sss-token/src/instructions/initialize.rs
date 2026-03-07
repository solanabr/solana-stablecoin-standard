use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_spl::token_2022::Token2022;
use spl_token_2022::{
    extension::ExtensionType,
    instruction::{
        initialize_mint, initialize_mint_close_authority,
        initialize_permanent_delegate,
    },
    state::{AccountState, Mint},
};
use spl_token_2022::extension::{
    default_account_state::instruction::initialize_default_account_state,
    metadata_pointer::instruction::initialize as initialize_metadata_pointer,
    transfer_hook::instruction::initialize as initialize_transfer_hook,
};
use spl_token_metadata_interface::instruction::initialize as initialize_token_metadata;

use crate::{
    constants::*,
    error::SssError,
    events::StablecoinInitialized,
    state::StablecoinConfig,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub transfer_hook_program_id: Option<Pubkey>,
    pub burner: Option<Pubkey>,
    pub pauser: Option<Pubkey>,
    pub blacklister: Option<Pubkey>,
    pub seizer: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub mint: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::SPACE,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(params.name.len() <= MAX_NAME_LEN, SssError::NameTooLong);
    require!(params.symbol.len() <= MAX_SYMBOL_LEN, SssError::SymbolTooLong);
    require!(params.uri.len() <= MAX_URI_LEN, SssError::UriTooLong);
    require!(params.decimals <= 9, SssError::InvalidDecimals);

    if params.enable_transfer_hook {
        require!(params.transfer_hook_program_id.is_some(), SssError::TransferHookMismatch);
    }

    let preset = if params.enable_permanent_delegate || params.enable_transfer_hook {
        PRESET_SSS2
    } else {
        PRESET_SSS1
    };

    let mint_key = ctx.accounts.mint.key();
    let authority_key = ctx.accounts.authority.key();
    let config_bump = ctx.bumps.config;
    let config_key = ctx.accounts.config.key();

    // --- Calculate mint account size with all requested extensions ---
    let mut extensions = vec![
        ExtensionType::MintCloseAuthority,
        ExtensionType::MetadataPointer,
    ];
    if params.default_account_frozen {
        extensions.push(ExtensionType::DefaultAccountState);
    }
    if params.enable_permanent_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    if params.enable_transfer_hook {
        extensions.push(ExtensionType::TransferHook);
    }

    let mint_size = ExtensionType::try_calculate_account_len::<Mint>(&extensions)
        .map_err(|_| error!(SssError::Overflow))?;

    // Estimate extra space for inline metadata (TLV header + data)
    // name(4+len) + symbol(4+len) + uri(4+len) + update_authority(32) + mint(32) + padding
    let metadata_extra_len = 256
        + params.name.len()
        + params.symbol.len()
        + params.uri.len();

    let total_mint_size = mint_size
        .checked_add(metadata_extra_len)
        .ok_or(error!(SssError::Overflow))?;

    // Fund with enough lamports for full size (extensions + metadata),
    // but allocate only mint_size bytes. Token-2022's initialize_token_metadata
    // will realloc the account using the excess lamports.
    let lamports = ctx.accounts.rent.minimum_balance(total_mint_size);

    // --- Create mint account ---
    system_program::create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        lamports,
        mint_size as u64,
        ctx.accounts.token_program.key,
    )?;

    // --- Initialize extensions BEFORE initialize_mint ---

    // 1. MintCloseAuthority
    invoke(
        &initialize_mint_close_authority(
            ctx.accounts.token_program.key,
            &mint_key,
            Some(&authority_key),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // 2. PermanentDelegate (SSS-2 — delegate = config PDA)
    if params.enable_permanent_delegate {
        invoke(
            &initialize_permanent_delegate(
                ctx.accounts.token_program.key,
                &mint_key,
                &config_key,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // 3. TransferHook (SSS-2)
    if params.enable_transfer_hook {
        let hook_program_id = params.transfer_hook_program_id.unwrap();
        invoke(
            &initialize_transfer_hook(
                ctx.accounts.token_program.key,
                &mint_key,
                Some(authority_key),
                Some(hook_program_id),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // 4. DefaultAccountState
    if params.default_account_frozen {
        invoke(
            &initialize_default_account_state(
                ctx.accounts.token_program.key,
                &mint_key,
                &AccountState::Frozen,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // 5. MetadataPointer — points to mint itself (inline metadata)
    invoke(
        &initialize_metadata_pointer(
            ctx.accounts.token_program.key,
            &mint_key,
            Some(authority_key),
            Some(mint_key),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // 6. initialize_mint (finalize)
    invoke(
        &initialize_mint(
            ctx.accounts.token_program.key,
            &mint_key,
            &config_key,       // mint authority = config PDA
            Some(&config_key), // freeze authority = config PDA
            params.decimals,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
    )?;

    // 7. Initialize inline metadata (requires mint authority = config PDA to sign)
    invoke_signed(
        &initialize_token_metadata(
            ctx.accounts.token_program.key,
            &mint_key,      // metadata account = mint
            &authority_key, // update authority
            &mint_key,      // mint
            &config_key,    // mint authority (PDA signs)
            params.name.clone(),
            params.symbol.clone(),
            params.uri.clone(),
        ),
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        &[&[CONFIG_SEED, mint_key.as_ref(), &[config_bump]]],
    )?;

    // --- Initialize StablecoinConfig PDA ---
    let config = &mut ctx.accounts.config;
    config.authority = authority_key;
    config.mint = mint_key;
    config.name = params.name.clone();
    config.symbol = params.symbol.clone();
    config.uri = params.uri;
    config.decimals = params.decimals;
    config.paused = false;
    config.preset = preset;
    config.enable_permanent_delegate = params.enable_permanent_delegate;
    config.enable_transfer_hook = params.enable_transfer_hook;
    config.default_account_frozen = params.default_account_frozen;
    config.burner = params.burner;
    config.pauser = params.pauser;
    config.blacklister = params.blacklister;
    config.seizer = params.seizer;
    config.bump = config_bump;

    emit!(StablecoinInitialized {
        mint: mint_key,
        authority: authority_key,
        preset,
        name: params.name,
        symbol: params.symbol,
    });

    Ok(())
}
