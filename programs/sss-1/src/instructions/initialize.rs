use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token_2022::{
    spl_token_2022::{
        extension::{metadata_pointer, ExtensionType},
        instruction::{initialize_mint2, initialize_permanent_delegate},
    },
    Token2022,
};

use crate::{
    constants::CONFIG_SEED, error::StablecoinError, events::StablecoinInitialized,
    state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = StablecoinConfig::LEN,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: Mint is initialized via CPI in handler with Token-2022 extensions
    #[account(mut)]
    pub mint: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<Initialize>,
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
    roles_enabled: bool,
    freeze_enabled: bool,
) -> Result<()> {
    require!(
        name.len() <= StablecoinConfig::MAX_NAME_LEN,
        StablecoinError::NameTooLong
    );
    require!(
        symbol.len() <= StablecoinConfig::MAX_SYMBOL_LEN,
        StablecoinError::SymbolTooLong
    );
    require!(
        uri.len() <= StablecoinConfig::MAX_URI_LEN,
        StablecoinError::UriTooLong
    );

    let mint_key = ctx.accounts.mint.key();
    let config_key = ctx.accounts.config.key();
    let config_bump = ctx.bumps.config;

    let enable_metadata = !(name.is_empty() && symbol.is_empty() && uri.is_empty());

    // Calculate metadata space manually when metadata is enabled:
    // TokenMetadata TLV: 4 (type) + 4 (length) + 32 (update_authority) + 32 (mint) +
    //   4 + name_len + 4 + symbol_len + 4 + uri_len + 4 (additional_metadata vec len)
    let metadata_space = if enable_metadata {
        4_usize
            .checked_add(4)
            .and_then(|s| s.checked_add(32)) // update_authority
            .and_then(|s| s.checked_add(32)) // mint
            .and_then(|s| s.checked_add(4)) // name length prefix
            .and_then(|s| s.checked_add(name.len()))
            .and_then(|s| s.checked_add(4)) // symbol length prefix
            .and_then(|s| s.checked_add(symbol.len()))
            .and_then(|s| s.checked_add(4)) // uri length prefix
            .and_then(|s| s.checked_add(uri.len()))
            .and_then(|s| s.checked_add(4)) // additional_metadata vec length
            .ok_or(StablecoinError::MathOverflow)?
    } else {
        0
    };

    let mut extensions = vec![ExtensionType::PermanentDelegate];
    if enable_metadata {
        extensions.push(ExtensionType::MetadataPointer);
        extensions.push(ExtensionType::TokenMetadata);
    }

    let mint_size =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extensions)
            .unwrap_or(spl_token_2022::state::Mint::LEN);

    // Add metadata space
    let total_size = mint_size
        .checked_add(metadata_space)
        .ok_or(StablecoinError::MathOverflow)?;

    let lamports = ctx.accounts.rent.minimum_balance(total_size);

    // Create the mint account
    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.admin.key(),
            &mint_key,
            lamports,
            total_size as u64,
            &ctx.accounts.token_program.key(),
        ),
        &[
            ctx.accounts.admin.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    if enable_metadata {
        // Initialize MetadataPointer extension (must be before initialize_mint2)
        let init_metadata_pointer_ix = metadata_pointer::instruction::initialize(
            &ctx.accounts.token_program.key(),
            &mint_key,
            Some(config_key),
            Some(mint_key),
        )?;

        anchor_lang::solana_program::program::invoke(
            &init_metadata_pointer_ix,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // Initialize PermanentDelegate extension before mint initialization.
    let init_permanent_delegate_ix =
        initialize_permanent_delegate(&ctx.accounts.token_program.key(), &mint_key, &config_key)?;

    anchor_lang::solana_program::program::invoke(
        &init_permanent_delegate_ix,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // Initialize the mint
    let freeze_authority = if freeze_enabled {
        Some(config_key)
    } else {
        None
    };

    let init_mint_ix = initialize_mint2(
        &ctx.accounts.token_program.key(),
        &mint_key,
        &config_key,
        freeze_authority.as_ref(),
        decimals,
    )?;

    anchor_lang::solana_program::program::invoke(
        &init_mint_ix,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    if enable_metadata {
        // Initialize TokenMetadata (after mint is initialized)
        let config_bump_bytes = [config_bump];
        let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &config_bump_bytes];

        let init_metadata_ix = spl_token_metadata_interface::instruction::initialize(
            &ctx.accounts.token_program.key(),
            &mint_key,
            &config_key,
            &mint_key,
            &config_key,
            name.clone(),
            symbol.clone(),
            uri.clone(),
        );

        invoke_signed(
            &init_metadata_ix,
            &[
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.config.to_account_info(),
            ],
            &[config_seeds],
        )?;
    }

    // Set config state
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.mint = mint_key;
    config.decimals = decimals;
    config.roles_enabled = roles_enabled;
    config.freeze_enabled = freeze_enabled;
    config.paused = false;
    config.name = name.clone();
    config.symbol = symbol.clone();
    config.uri = uri.clone();
    config.bump = config_bump;
    config._reserved = [0u8; 64];

    emit!(StablecoinInitialized {
        config: config.key(),
        admin: config.admin,
        mint: mint_key,
        name,
        symbol,
        decimals,
    });

    Ok(())
}
