use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::{invoke, invoke_signed}, system_instruction};
use anchor_spl::token_2022;
use spl_token_2022::{
    extension::{
        default_account_state::instruction::initialize_default_account_state,
        metadata_pointer::instruction::initialize as initialize_metadata_pointer,
        transfer_hook::instruction::initialize as initialize_transfer_hook_ix,
        ExtensionType,
    },
    instruction::{initialize_mint2, initialize_permanent_delegate},
    state::AccountState,
};

use crate::error::SssError;
use crate::events::MintCreated;
use crate::state::{Preset, StablecoinConfig};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMintParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub preset: u8,
    pub transfer_hook_program: Option<Pubkey>,  // required for SSS-2/SSS-3
    pub treasury: Option<Pubkey>,               // required for SSS-2/SSS-3
}

#[derive(Accounts)]
#[instruction(params: CreateMintParams)]
pub struct CreateMint<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Mint account created manually for Token-2022 extensions
    #[account(mut)]
    pub mint: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = StablecoinConfig::LEN,
        seeds = [b"sss_config", mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub token_program: Program<'info, token_2022::Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CreateMint>, params: CreateMintParams) -> Result<()> {
    require!(params.name.len() <= crate::utils::MAX_NAME_LEN, SssError::NameTooLong);
    require!(params.symbol.len() <= crate::utils::MAX_SYMBOL_LEN, SssError::SymbolTooLong);
    require!(params.uri.len() <= crate::utils::MAX_URI_LEN, SssError::UriTooLong);

    let preset = match params.preset {
        0 => Preset::SSS1,
        1 => Preset::SSS2,
        2 => Preset::SSS3,
        _ => return Err(SssError::InvalidPreset.into()),
    };

    // SSS-2 and SSS-3 require transfer_hook_program and treasury
    let transfer_hook_program = if preset.has_compliance_features() {
        require!(params.transfer_hook_program.is_some(), SssError::TransferHookRequired);
        require!(params.treasury.is_some(), SssError::TreasuryRequired);
        params.transfer_hook_program.unwrap()
    } else {
        Pubkey::default()
    };

    let treasury = if preset.has_compliance_features() {
        let t = params.treasury.unwrap();
        require!(t != Pubkey::default(), SssError::InvalidInput);
        t
    } else {
        Pubkey::default()
    };

    let mint = &ctx.accounts.mint;
    let admin = &ctx.accounts.admin;
    let token_program = &ctx.accounts.token_program;
    let system_program = &ctx.accounts.system_program;

    // Calculate space for extensions (only initialized extensions)
    let mut extensions = vec![ExtensionType::MetadataPointer];
    if preset.has_compliance_features() {
        extensions.push(ExtensionType::DefaultAccountState);
        extensions.push(ExtensionType::PermanentDelegate);
        extensions.push(ExtensionType::TransferHook);
    }
    // Note: ConfidentialTransferMint (SSS-3) is NOT included because
    // Token-2022 requires account_len == try_calculate_account_len(initialized_extensions).
    // Since we don't initialize it, including it would cause InitializeMint2 to fail.

    let mint_space =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extensions)
            .unwrap();

    let lamports = Rent::get()?.minimum_balance(mint_space);

    // 1. Create mint account
    invoke(
        &system_instruction::create_account(
            &admin.key(),
            &mint.key(),
            lamports,
            mint_space as u64,
            &token_program.key(),
        ),
        &[
            admin.to_account_info(),
            mint.to_account_info(),
            system_program.to_account_info(),
        ],
    )?;

    // Compute config PDA key and seeds (needed for extensions and mint init)
    let config_key = ctx.accounts.config.key();
    let mint_key_ref = mint.key();
    let config_bump = ctx.bumps.config;
    let pda_seeds: &[&[u8]] = &[b"sss_config", mint_key_ref.as_ref(), &[config_bump]];

    // 2a. Initialize PermanentDelegate (config PDA is the permanent delegate)
    if preset.has_compliance_features() {
        invoke(
            &initialize_permanent_delegate(
                &token_program.key(),
                &mint.key(),
                &config_key,
            )
            .map_err(|_| SssError::InvalidPreset)?,
            &[mint.to_account_info()],
        )?;
    }

    // 2b. Initialize TransferHook
    if preset.has_compliance_features() {
        invoke(
            &initialize_transfer_hook_ix(
                &token_program.key(),
                &mint.key(),
                Some(config_key),
                Some(transfer_hook_program),
            )
            .map_err(|_| SssError::InvalidPreset)?,
            &[mint.to_account_info()],
        )?;
    }

    // 3. Initialize DefaultAccountState (SSS-2/SSS-3: all accounts start frozen)
    if preset.has_compliance_features() {
        invoke(
            &initialize_default_account_state(
                &token_program.key(),
                &mint.key(),
                &AccountState::Frozen,
            )
            .map_err(|_| SssError::InvalidPreset)?,
            &[mint.to_account_info()],
        )?;
    }

    // 4. Initialize MetadataPointer (points to self)
    invoke(
        &initialize_metadata_pointer(
            &token_program.key(),
            &mint.key(),
            Some(admin.key()),
            Some(mint.key()),
        )
        .map_err(|_| SssError::InvalidPreset)?,
        &[mint.to_account_info()],
    )?;

    // 5. Initialize Mint
    let freeze_authority = if preset.has_compliance_features() {
        Some(&config_key)
    } else {
        None
    };

    invoke_signed(
        &initialize_mint2(
            &token_program.key(),
            &mint.key(),
            &config_key,
            freeze_authority,
            params.decimals,
        )
        .map_err(|_| SssError::InvalidPreset)?,
        &[mint.to_account_info()],
        &[pda_seeds],
    )?;

    // Note: Token metadata is initialized via a separate `set_metadata` instruction.
    // Token-2022 requires account data length == try_calculate_account_len(extensions),
    // and metadata requires a realloc which cannot happen in the same transaction as
    // create_account in Solana v3.0.

    // Initialize config account
    let config = &mut ctx.accounts.config;
    config.admin = admin.key();
    config.pending_admin = Pubkey::default();
    config.mint = mint.key();
    config.preset = preset;
    config.paused = false;
    config.transfer_hook_program = transfer_hook_program;
    config.treasury = treasury;
    config.total_minted = 0;
    config.total_burned = 0;
    config.total_seized = 0;
    config.bump = ctx.bumps.config;

    emit!(MintCreated {
        config: config.key(),
        mint: mint.key(),
        admin: admin.key(),
        preset: params.preset,
        name: params.name,
        symbol: params.symbol,
    });

    Ok(())
}
