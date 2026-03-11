use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SssError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ConfigureOracleParams {
    /// The oracle price feed account address
    pub price_feed: Pubkey,
    /// Peg currency code (max 8 ASCII bytes, e.g. "EUR", "XAU", "BRL")
    pub peg_currency: String,
    /// Maximum staleness in seconds (e.g. 60 = reject prices older than 60s)
    pub max_staleness_secs: i64,
    /// Price exponent (e.g. -8 for Pyth)
    pub price_exponent: i32,
}

#[derive(Accounts)]
pub struct ConfigureOracle<'info> {
    /// Must be the master authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Mint key used only for PDA derivation; validated via config PDA seeds
    pub mint: AccountInfo<'info>,

    /// Stablecoin config PDA — verify authority
    #[account(
        mut,
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    /// Roles config PDA — check master_authority
    #[account(
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    /// Oracle config PDA (init-if-needed)
    #[account(
        init_if_needed,
        payer = authority,
        space = OracleConfig::LEN,
        seeds = [ORACLE_CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    pub system_program: Program<'info, System>,
}

pub fn configure_handler(
    ctx: Context<ConfigureOracle>,
    params: ConfigureOracleParams,
) -> Result<()> {
    let caller = ctx.accounts.authority.key();
    let roles = &ctx.accounts.roles_config;

    // Only master authority can configure oracle
    require!(caller == roles.master_authority, SssError::Unauthorized);

    // Validate peg currency
    require!(
        !params.peg_currency.is_empty() && params.peg_currency.len() <= MAX_PEG_CURRENCY_LEN,
        SssError::InvalidPegCurrency
    );
    require!(
        params.peg_currency.is_ascii(),
        SssError::InvalidPegCurrency
    );

    // Validate staleness
    require!(params.max_staleness_secs > 0, SssError::InvalidOracleFeed);

    // Pack peg currency into fixed-size array
    let mut peg_bytes = [0u8; 8];
    let src = params.peg_currency.as_bytes();
    peg_bytes[..src.len()].copy_from_slice(src);

    // Configure oracle
    let oracle = &mut ctx.accounts.oracle_config;
    oracle.mint = ctx.accounts.mint.key();
    oracle.price_feed = params.price_feed;
    oracle.peg_currency = peg_bytes;
    oracle.max_staleness_secs = params.max_staleness_secs;
    oracle.price_exponent = params.price_exponent;
    oracle.enabled = true;
    oracle.configured_by = caller;
    oracle.configured_at = Clock::get()?.unix_timestamp;
    oracle.bump = ctx.bumps.oracle_config;

    // Update stablecoin config
    ctx.accounts.stablecoin_config.oracle_enabled = true;

    msg!(
        "Oracle configured: feed={}, peg={}, staleness={}s",
        params.price_feed,
        params.peg_currency,
        params.max_staleness_secs
    );

    Ok(())
}

#[derive(Accounts)]
pub struct DisableOracle<'info> {
    /// Must be the master authority
    pub authority: Signer<'info>,

    /// CHECK: Mint key used only for PDA derivation; validated via config PDA seeds
    pub mint: AccountInfo<'info>,

    /// Stablecoin config PDA
    #[account(
        mut,
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    /// Roles config PDA
    #[account(
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    /// Oracle config PDA
    #[account(
        mut,
        seeds = [ORACLE_CONFIG_SEED, mint.key().as_ref()],
        bump = oracle_config.bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

pub fn disable_handler(ctx: Context<DisableOracle>) -> Result<()> {
    let caller = ctx.accounts.authority.key();
    require!(
        caller == ctx.accounts.roles_config.master_authority,
        SssError::Unauthorized
    );

    ctx.accounts.oracle_config.enabled = false;
    ctx.accounts.stablecoin_config.oracle_enabled = false;

    msg!("Oracle disabled for mint {}", ctx.accounts.mint.key());
    Ok(())
}

/// Read and validate a Pyth-compatible price feed account.
/// Returns (price, exponent, publish_time) if valid.
///
/// Supports Pyth V2 push oracle format:
/// - Offset 0: magic (u32) = 0xa1b2c3d4
/// - Offset 208: price (i64)
/// - Offset 216: confidence (u64)
/// - Offset 224: status (u32) = 1 (trading)
/// - Offset 232: exponent (i32)
/// - Offset 240: publish_slot (u64)
pub fn read_oracle_price(
    oracle_data: &[u8],
    max_staleness_secs: i64,
    current_time: i64,
) -> Result<(i64, i32, i64)> {
    // Minimum data length for a Pyth price account
    require!(oracle_data.len() >= 248, SssError::InvalidOracleFeed);

    // Check Pyth magic number
    let magic = u32::from_le_bytes(oracle_data[0..4].try_into().unwrap());
    require!(magic == 0xa1b2c3d4, SssError::InvalidOracleFeed);

    // Read price data
    let price = i64::from_le_bytes(oracle_data[208..216].try_into().unwrap());
    let exponent = i32::from_le_bytes(oracle_data[232..236].try_into().unwrap());

    // Read status (1 = trading)
    let status = u32::from_le_bytes(oracle_data[224..228].try_into().unwrap());
    require!(status == 1, SssError::OracleStale);

    // For staleness check, use the aggregate publish slot timestamp
    // Pyth V2 stores unix_timestamp at offset 176
    let publish_time = i64::from_le_bytes(oracle_data[176..184].try_into().unwrap());

    // Check staleness
    let age = current_time.saturating_sub(publish_time);
    require!(age <= max_staleness_secs, SssError::OracleStale);

    // Price must be positive
    require!(price > 0, SssError::InvalidOracleFeed);

    Ok((price, exponent, publish_time))
}
