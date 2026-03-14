use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::*;
use crate::errors::SssError;

// =============================================================================
// ORACLE CONFIGURATION (Pyth V2 Price Feed Integration)
// =============================================================================

/// Configure oracle for on-chain price validation during mint/burn
pub fn configure_handler(
    ctx: Context<ConfigureOracle>,
    price_feed: Pubkey,
    max_staleness_seconds: u64,
    max_deviation_bps: u16,
    target_price: i64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        ctx.accounts.authority.key() == config.authority,
        SssError::Unauthorized
    );

    let oracle_config = &mut ctx.accounts.oracle_config;
    oracle_config.stablecoin = config.key();
    oracle_config.price_feed = price_feed;
    oracle_config.max_staleness_seconds = max_staleness_seconds;
    oracle_config.max_deviation_bps = max_deviation_bps;
    oracle_config.enabled = true; // enabled by default
    oracle_config.target_price = target_price;
    oracle_config.last_validated_price = 0;
    oracle_config.last_validated_at = 0;
    oracle_config.bump = ctx.bumps.oracle_config;

    msg!(
        "Oracle configured: price_feed={}, max_staleness={}s, max_deviation={}bps, target={}",
        price_feed,
        max_staleness_seconds,
        max_deviation_bps,
        target_price
    );

    Ok(())
}

/// Toggle oracle validation on/off
pub fn toggle_handler(
    ctx: Context<ToggleOracle>,
    enabled: bool,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        ctx.accounts.authority.key() == config.authority,
        SssError::Unauthorized
    );

    let oracle_config = &mut ctx.accounts.oracle_config;
    oracle_config.enabled = enabled;

    msg!("Oracle validation {}", if enabled { "enabled" } else { "disabled" });

    Ok(())
}

/// Mint with oracle price validation
/// Uses Pyth V2 binary format (manual parsing without pyth-sdk-solana)
pub fn mint_with_oracle_handler(ctx: Context<MintWithOracle>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.is_paused, SssError::Paused);

    let roles = &ctx.accounts.roles;
    require!(roles.is_minter && roles.active, SssError::NotMinter);

    let oracle_config = &ctx.accounts.oracle_config;
    
    // If oracle is enabled, validate the price
    if oracle_config.enabled {
        let price_feed_info = &ctx.accounts.price_feed;
        let price_feed_data = price_feed_info.try_borrow_data()?;
        
        // Parse Pyth V2 price account data (manual parsing)
        // Pyth V2 Price Account Layout:
        // - magic: [u8; 4] at offset 0 = 0xa1b2c3d4
        // - ver: u32 at offset 4
        // - type: u32 at offset 8
        // - size: u32 at offset 12
        // ... various fields ...
        // - price: i64 at offset 208 (agg.price)
        // - conf: u64 at offset 216 (agg.conf)
        // - status: u32 at offset 224 (agg.status) - 1 = trading
        // - pub_slot: u64 at offset 232
        // - timestamp: i64 at offset 240 (agg.timestamp)
        
        // Check minimum data length for Pyth V2 price account
        require!(price_feed_data.len() >= 256, SssError::OraclePriceStale);
        
        // Verify Pyth V2 magic number (0xa1b2c3d4)
        let magic = u32::from_le_bytes([
            price_feed_data[0],
            price_feed_data[1],
            price_feed_data[2],
            price_feed_data[3],
        ]);
        require!(magic == 0xa1b2c3d4u32, SssError::OraclePriceStale);
        
        // Read price, confidence, and timestamp from V2 layout
        let price = i64::from_le_bytes(
            price_feed_data[208..216].try_into().unwrap()
        );
        let conf = u64::from_le_bytes(
            price_feed_data[216..224].try_into().unwrap()
        );
        let status = u32::from_le_bytes(
            price_feed_data[224..228].try_into().unwrap()
        );
        let timestamp = i64::from_le_bytes(
            price_feed_data[240..248].try_into().unwrap()
        );
        
        // Status must be Trading (1)
        require!(status == 1, SssError::OraclePriceStale);
        
        let now = Clock::get()?.unix_timestamp;
        
        // Validate price using OracleConfig helper
        match oracle_config.validate_price(price, conf, timestamp, now) {
            Ok(_validated_price) => {
                // Update last validated in a separate instruction or skip
                msg!("Oracle validated: price={} conf={} at {}", price, conf, timestamp);
            }
            Err(e) => {
                match e {
                    "OracleStale" => return Err(SssError::OraclePriceStale.into()),
                    "ConfidenceTooWide" => return Err(SssError::OracleConfidenceTooWide.into()),
                    "PriceDeviation" => return Err(SssError::PriceDeviationExceeded.into()),
                    _ => return Err(SssError::OraclePriceStale.into()),
                }
            }
        }
    }

    // Check supply cap
    let new_supply = config.current_supply().checked_add(amount)
        .ok_or(SssError::Overflow)?;
    require!(
        config.supply_cap == 0 || new_supply <= config.supply_cap,
        SssError::SupplyCapExceeded
    );

    // Mint tokens
    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[b"config", mint_key.as_ref(), &[config.bump]];
    let signer_seeds = &[seeds];

    anchor_spl::token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_2022::MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Update config
    let config = &mut ctx.accounts.config;
    config.total_minted = config.total_minted.saturating_add(amount);
    config.last_updated = Clock::get()?.unix_timestamp;

    msg!(
        "Minted {} tokens with oracle validation | Supply: {}/{}",
        amount,
        config.current_supply(),
        if config.supply_cap == 0 { "unlimited".to_string() } else { config.supply_cap.to_string() }
    );

    Ok(())
}

// =============================================================================
// ACCOUNT CONTEXTS
// =============================================================================

#[derive(Accounts)]
pub struct ConfigureOracle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        constraint = config.mint == mint.key()
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = OracleConfig::SPACE,
        seeds = [b"oracle", config.key().as_ref()],
        bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ToggleOracle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        constraint = config.mint == mint.key()
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"oracle", config.key().as_ref()],
        bump = oracle_config.bump,
        constraint = oracle_config.stablecoin == config.key(),
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

#[derive(Accounts)]
pub struct MintWithOracle<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        constraint = config.mint == mint.key()
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [b"roles", config.key().as_ref(), minter.key().as_ref()],
        bump = roles.bump,
        constraint = roles.stablecoin == config.key(),
    )]
    pub roles: Account<'info, RolesConfig>,

    #[account(
        seeds = [b"oracle", config.key().as_ref()],
        bump = oracle_config.bump,
        constraint = oracle_config.stablecoin == config.key(),
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    /// Pyth V2 price feed account
    /// CHECK: Validated in instruction handler via magic number and data parsing
    #[account(
        constraint = oracle_config.price_feed == price_feed.key(),
    )]
    pub price_feed: AccountInfo<'info>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}
