use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{
        spl_token_2022::{
            extension::{
                default_account_state::instruction::initialize_default_account_state,
                transfer_hook::instruction::initialize as initialize_transfer_hook,
                ExtensionType,
            },
            instruction::{initialize_mint2, initialize_permanent_delegate},
            state::AccountState,
        },
        Token2022,
    },
};
use spl_token_metadata_interface;
use transfer_hook::cpi as hook_cpi;

use crate::{
    constants::*,
    error::SSSError,
    events::TokenInitialized,
    state::{RoleManager, StablecoinConfig},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub enable_default_frozen: bool,
    pub transfer_hook_program_id: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Token-2022 mint initialized via CPI in handler
    #[account(mut)]
    pub mint: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::LEN,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        init,
        payer = authority,
        space = RoleManager::LEN,
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref()],
        bump
    )]
    pub role_manager: Account<'info, RoleManager>,

    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    // For SSS-2 callers pass two remaining_accounts:
    //   [0] hook_program       (readonly)
    //   [1] extra_account_meta_list PDA  (writable)
    // SSS-1 callers pass no remaining_accounts.
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, Initialize<'info>>,
    params: InitializeParams,
) -> Result<()> {
    require!(params.name.len() <= MAX_NAME_LEN, SSSError::NameTooLong);
    require!(params.symbol.len() <= MAX_SYMBOL_LEN, SSSError::SymbolTooLong);
    require!(params.uri.len() <= MAX_URI_LEN, SSSError::UriTooLong);

    if params.enable_transfer_hook {
        require!(
            params.transfer_hook_program_id.is_some(),
            SSSError::InvalidPreset
        );
        require!(ctx.remaining_accounts.len() >= 2, SSSError::InvalidPreset);
    }

    let mint_key = ctx.accounts.mint.key();
    let authority_key = ctx.accounts.authority.key();
    let config_key = ctx.accounts.stablecoin_config.key();
    let bump = ctx.bumps.stablecoin_config;

    let mut extensions = vec![ExtensionType::MetadataPointer];
    if params.enable_permanent_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    if params.enable_transfer_hook {
        extensions.push(ExtensionType::TransferHook);
    }
    if params.enable_default_frozen {
        extensions.push(ExtensionType::DefaultAccountState);
    }

    let mint_size =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extensions)
            .map_err(|_| SSSError::MathOverflow)?;

    // TokenMetadata is stored inline in the mint (MetadataPointer → mint).
    // InitializeTokenMetadata reallocates the account data but does NOT
    // transfer lamports. We must include the metadata TLV size upfront so the
    // mint is rent-exempt after the realloc.
    //   TLV header : 2 (type) + 4 (length) = 6 bytes
    //   Packed body: OptionalNonZeroPubkey (32) + Pubkey (32)
    //                + 4+name + 4+symbol + 4+uri + 4 (empty additionalMetadata)
    let metadata_size: usize = 6
        + 32
        + 32
        + 4 + params.name.len()
        + 4 + params.symbol.len()
        + 4 + params.uri.len()
        + 4;

    let total_mint_size = mint_size
        .checked_add(metadata_size)
        .ok_or(SSSError::MathOverflow)?;

    // Fund for final post-realloc size; allocate only mint_size bytes.
    // InitializeMint2 validates data.len() == try_calculate_account_len(extensions);
    // InitializeTokenMetadata reallocs to add metadata bytes using these pre-funded lamports.
    let lamports = ctx.accounts.rent.minimum_balance(total_mint_size);

    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::create_account(
            &authority_key,
            &mint_key,
            lamports,
            mint_size as u64,
            &ctx.accounts.token_2022_program.key(),
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    invoke_signed(
        &spl_token_2022::extension::metadata_pointer::instruction::initialize(
            &ctx.accounts.token_2022_program.key(),
            &mint_key,
            Some(authority_key),
            Some(mint_key),
        )
        .map_err(|_| SSSError::MathOverflow)?,
        &[ctx.accounts.mint.to_account_info()],
        &[],
    )?;

    if params.enable_permanent_delegate {
        invoke_signed(
            &initialize_permanent_delegate(
                &ctx.accounts.token_2022_program.key(),
                &mint_key,
                &config_key,
            )
            .map_err(|_| SSSError::MathOverflow)?,
            &[ctx.accounts.mint.to_account_info()],
            &[],
        )?;
    }

    if params.enable_transfer_hook {
        let hook_program_id = params.transfer_hook_program_id.unwrap();
        invoke_signed(
            &initialize_transfer_hook(
                &ctx.accounts.token_2022_program.key(),
                &mint_key,
                Some(authority_key),
                Some(hook_program_id),
            )
            .map_err(|_| SSSError::MathOverflow)?,
            &[ctx.accounts.mint.to_account_info()],
            &[],
        )?;
    }

    if params.enable_default_frozen {
        invoke_signed(
            &initialize_default_account_state(
                &ctx.accounts.token_2022_program.key(),
                &mint_key,
                &AccountState::Frozen,
            )
            .map_err(|_| SSSError::MathOverflow)?,
            &[ctx.accounts.mint.to_account_info()],
            &[],
        )?;
    }

    // Config PDA is both mint authority and freeze authority — all future
    // mint/freeze/seize CPIs sign with PDA seeds [STABLECOIN_SEED, mint, bump].
    invoke_signed(
        &initialize_mint2(
            &ctx.accounts.token_2022_program.key(),
            &mint_key,
            &config_key,
            Some(&config_key),
            params.decimals,
        )
        .map_err(|_| SSSError::MathOverflow)?,
        &[ctx.accounts.mint.to_account_info()],
        &[],
    )?;

    // Token-2022 metadata initialize: 4 accounts in order —
    //   [0] metadata (= mint, writable)
    //   [1] update_authority (readonly)
    //   [2] mint (readonly)
    //   [3] mint_authority (must match actual mint authority; signs — config PDA)
    invoke_signed(
        &spl_token_metadata_interface::instruction::initialize(
            &ctx.accounts.token_2022_program.key(),
            &mint_key,      // metadata
            &authority_key, // update_authority
            &mint_key,      // mint
            &config_key,    // mint_authority = config PDA
            params.name.clone(),
            params.symbol.clone(),
            params.uri.clone(),
        ),
        &[
            ctx.accounts.mint.to_account_info(),              // [0] metadata
            ctx.accounts.authority.to_account_info(),         // [1] update_authority
            ctx.accounts.mint.to_account_info(),              // [2] mint
            ctx.accounts.stablecoin_config.to_account_info(), // [3] mint_authority
        ],
        &[&[STABLECOIN_SEED, mint_key.as_ref(), &[bump]]],
    )?;

    let config = &mut ctx.accounts.stablecoin_config;
    config.authority = authority_key;
    config.mint = mint_key;
    config.name = params.name.clone();
    config.symbol = params.symbol.clone();
    config.uri = params.uri.clone();
    config.decimals = params.decimals;
    config.enable_permanent_delegate = params.enable_permanent_delegate;
    config.enable_transfer_hook = params.enable_transfer_hook;
    config.enable_default_frozen = params.enable_default_frozen;
    config.paused = false;
    config.total_minted = 0;
    config.total_burned = 0;
    config.bump = bump;
    config._reserved = [0u8; 64];

    let roles = &mut ctx.accounts.role_manager;
    roles.stablecoin = config_key;
    roles.minters = vec![];
    roles.burners = vec![];
    roles.pausers = vec![];
    roles.blacklisters = vec![];
    roles.seizers = vec![];
    roles.bump = ctx.bumps.role_manager;
    roles._reserved = [0u8; 32];

    // SSS-2 only: CPI to hook program to create ExtraAccountMetaList PDA.
    // remaining_accounts[0] = hook_program (readonly)
    // remaining_accounts[1] = extra_account_meta_list PDA (writable — set by client)
    if params.enable_transfer_hook {
        let hook_program_info = ctx.remaining_accounts[0].clone();
        let extra_meta_info = ctx.remaining_accounts[1].clone();

        let cpi_ctx = CpiContext::new(
            hook_program_info,
            hook_cpi::accounts::InitializeExtraAccountMetaList {
                payer: ctx.accounts.authority.to_account_info(),
                extra_account_meta_list: extra_meta_info,
                mint: ctx.accounts.mint.to_account_info(),
                token_program: ctx.accounts.token_2022_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
        );
        hook_cpi::initialize_extra_account_meta_list(cpi_ctx)?;
    }

    let preset = if params.enable_permanent_delegate && params.enable_transfer_hook {
        "SSS-2"
    } else {
        "SSS-1"
    };

    emit!(TokenInitialized {
        mint: mint_key,
        authority: authority_key,
        preset: preset.to_string(),
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        decimals: params.decimals,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
