#![allow(unexpected_cfgs, deprecated)]
use anchor_lang::prelude::*;

declare_id!("27eVzSd6UBsLAzzXaSfMbUM5dgZLv4H8fiQTVqXkESFb");

/// Oracle Integration Module for Solana Stablecoin Standard
///
/// Provides oracle-based pricing for non-USD stablecoin pegs.
/// Supports two modes:
/// 1. **Manual mode** (localnet/testing): Authority sets price directly via `set_price`
/// 2. **Switchboard mode** (devnet/mainnet): Reads raw Switchboard On-Demand feed data
///    without requiring the `switchboard-on-demand` crate (avoids dep conflicts)
///
/// This is a SEPARATE program — it does not modify the token.
/// It's a pricing layer that sits alongside the main stablecoin program.
#[program]
pub mod oracle_module {
    use super::*;

    /// Initialize an oracle configuration for a stablecoin.
    pub fn initialize_oracle(
        ctx: Context<InitializeOracle>,
        base_currency: String,
        staleness_threshold: i64,
    ) -> Result<()> {
        require!(
            base_currency.len() <= OracleConfig::MAX_CURRENCY_LEN,
            OracleError::CurrencyTooLong
        );
        require!(staleness_threshold > 0, OracleError::InvalidThreshold);

        let oracle_config = &mut ctx.accounts.oracle_config;
        oracle_config.authority = ctx.accounts.authority.key();
        oracle_config.stablecoin_config = ctx.accounts.stablecoin_config.key();
        oracle_config.feed_address = ctx.accounts.feed.key();
        oracle_config.base_currency = base_currency;
        oracle_config.staleness_threshold = staleness_threshold;
        oracle_config.last_price = 0;
        oracle_config.last_price_timestamp = 0;
        oracle_config.price_decimals = 9;
        oracle_config.bump = ctx.bumps.oracle_config;

        emit!(OracleInitialized {
            config: oracle_config.key(),
            authority: oracle_config.authority,
            feed: oracle_config.feed_address,
            base_currency: oracle_config.base_currency.clone(),
        });

        Ok(())
    }

    /// Update the oracle feed address.
    pub fn update_feed(ctx: Context<UpdateFeed>, new_feed: Pubkey) -> Result<()> {
        let oracle_config = &mut ctx.accounts.oracle_config;
        let old_feed = oracle_config.feed_address;
        oracle_config.feed_address = new_feed;

        emit!(FeedUpdated {
            config: oracle_config.key(),
            old_feed,
            new_feed,
        });

        Ok(())
    }

    /// Manually set the price (for localnet testing / manual override).
    ///
    /// On devnet/mainnet, use `refresh_price` to read from Switchboard.
    pub fn set_price(
        ctx: Context<SetPrice>,
        price: i128,
        decimals: u8,
    ) -> Result<()> {
        require!(price > 0, OracleError::InvalidPrice);

        let oracle_config = &mut ctx.accounts.oracle_config;
        oracle_config.last_price = price;
        oracle_config.price_decimals = decimals;
        oracle_config.last_price_timestamp = Clock::get()?.unix_timestamp;

        emit!(PriceUpdated {
            config: oracle_config.key(),
            price,
            decimals,
            source: "manual".to_string(),
        });

        Ok(())
    }

    /// Refresh price from a Switchboard On-Demand pull feed.
    ///
    /// Reads the raw account data from the Switchboard aggregator.
    /// Switchboard PullFeedAccountData layout (simplified):
    ///   - Bytes 0..8:   discriminator
    ///   - Bytes 32..48: result.value (i128, little-endian, 18 decimals)
    ///   - Bytes 48..56: result.slot (u64)
    ///
    /// Note: For production, consider using the `switchboard-on-demand` crate
    /// which provides proper type-safe deserialization. We parse raw bytes
    /// here to avoid dependency version conflicts with Anchor 0.31.
    pub fn refresh_price(ctx: Context<RefreshPrice>) -> Result<()> {
        let oracle_config = &mut ctx.accounts.oracle_config;
        let feed_account = &ctx.accounts.feed;

        let data = feed_account.try_borrow_data()?;

        // Switchboard On-Demand feeds store result at offset 32
        // The value is an i128 with 18 decimal places
        require!(data.len() >= 56, OracleError::InvalidFeedData);

        let value_bytes: [u8; 16] = data[32..48]
            .try_into()
            .map_err(|_| OracleError::InvalidFeedData)?;
        let raw_value = i128::from_le_bytes(value_bytes);

        let slot_bytes: [u8; 8] = data[48..56]
            .try_into()
            .map_err(|_| OracleError::InvalidFeedData)?;
        let result_slot = u64::from_le_bytes(slot_bytes);

        // Validate staleness (slot-based: ~400ms per slot)
        let clock = Clock::get()?;
        let slots_stale = (clock.slot as i64) - (result_slot as i64);
        let seconds_stale = slots_stale * 400 / 1000;

        require!(
            seconds_stale <= oracle_config.staleness_threshold,
            OracleError::StaleFeed
        );

        // Convert from 18 decimals to 9 decimals
        let price_9_decimals = raw_value / 1_000_000_000; // 18 - 9 = 9 zeros
        require!(price_9_decimals > 0, OracleError::InvalidPrice);

        oracle_config.last_price = price_9_decimals;
        oracle_config.price_decimals = 9;
        oracle_config.last_price_timestamp = clock.unix_timestamp;

        emit!(PriceUpdated {
            config: oracle_config.key(),
            price: price_9_decimals,
            decimals: 9,
            source: "switchboard".to_string(),
        });

        msg!("Oracle price refreshed: {} (9 dec)", price_9_decimals);

        Ok(())
    }

    /// Get the cached price. Validates staleness.
    pub fn get_price(ctx: Context<GetPrice>) -> Result<()> {
        let oracle_config = &ctx.accounts.oracle_config;

        let clock = Clock::get()?;
        let age = clock.unix_timestamp - oracle_config.last_price_timestamp;
        require!(age <= oracle_config.staleness_threshold, OracleError::StaleFeed);
        require!(oracle_config.last_price > 0, OracleError::InvalidPrice);

        emit!(PriceQueried {
            config: oracle_config.key(),
            price: oracle_config.last_price,
            decimals: oracle_config.price_decimals,
            base_currency: oracle_config.base_currency.clone(),
            age_seconds: age,
        });

        msg!(
            "Price: {} ({} dec) for {} — age {}s",
            oracle_config.last_price,
            oracle_config.price_decimals,
            oracle_config.base_currency,
            age
        );

        Ok(())
    }

    /// Calculate token amount from collateral using oracle price.
    ///
    /// Formula: tokens = collateral_amount * price / 10^price_decimals
    pub fn calculate_mint_amount(
        ctx: Context<GetPrice>,
        collateral_amount: u64,
        token_decimals: u8,
    ) -> Result<()> {
        let oracle_config = &ctx.accounts.oracle_config;

        let clock = Clock::get()?;
        let age = clock.unix_timestamp - oracle_config.last_price_timestamp;
        require!(age <= oracle_config.staleness_threshold, OracleError::StaleFeed);
        require!(oracle_config.last_price > 0, OracleError::InvalidPrice);

        let price = oracle_config.last_price as u128;
        let collateral = collateral_amount as u128;
        let token_factor = 10u128.pow(token_decimals as u32);
        let price_factor = 10u128.pow(oracle_config.price_decimals as u32);

        let tokens = collateral
            .checked_mul(price)
            .and_then(|v| v.checked_mul(token_factor))
            .and_then(|v| v.checked_div(price_factor))
            .ok_or(OracleError::MathOverflow)?;

        emit!(MintAmountCalculated {
            collateral_amount,
            token_amount: tokens as u64,
            price: oracle_config.last_price,
            base_currency: oracle_config.base_currency.clone(),
        });

        msg!("{} collateral → {} tokens", collateral_amount, tokens);

        Ok(())
    }
}

// ── Account State ───────────────────────────────────────────────────────

#[account]
pub struct OracleConfig {
    pub authority: Pubkey,
    pub stablecoin_config: Pubkey,
    pub feed_address: Pubkey,
    pub base_currency: String,
    pub staleness_threshold: i64,
    pub last_price: i128,
    pub last_price_timestamp: i64,
    pub price_decimals: u8,
    pub bump: u8,
}

impl OracleConfig {
    pub const MAX_CURRENCY_LEN: usize = 10;

    pub const fn space() -> usize {
        8 +     // discriminator
        32 +    // authority
        32 +    // stablecoin_config
        32 +    // feed_address
        (4 + Self::MAX_CURRENCY_LEN) + // base_currency
        8 +     // staleness_threshold
        16 +    // last_price (i128)
        8 +     // last_price_timestamp
        1 +     // price_decimals
        1       // bump
    }
}

// ── Instruction Accounts ────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeOracle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = OracleConfig::space(),
        seeds = [b"oracle", stablecoin_config.key().as_ref()],
        bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    /// CHECK: The SSS StablecoinConfig account
    pub stablecoin_config: AccountInfo<'info>,

    /// CHECK: Switchboard feed (or placeholder for manual mode)
    pub feed: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateFeed<'info> {
    pub authority: Signer<'info>,

    #[account(mut, has_one = authority)]
    pub oracle_config: Account<'info, OracleConfig>,
}

#[derive(Accounts)]
pub struct SetPrice<'info> {
    pub authority: Signer<'info>,

    #[account(mut, has_one = authority)]
    pub oracle_config: Account<'info, OracleConfig>,
}

#[derive(Accounts)]
pub struct RefreshPrice<'info> {
    pub authority: Signer<'info>,

    #[account(mut, has_one = authority)]
    pub oracle_config: Account<'info, OracleConfig>,

    /// CHECK: Switchboard On-Demand pull feed account
    #[account(address = oracle_config.feed_address)]
    pub feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct GetPrice<'info> {
    pub oracle_config: Account<'info, OracleConfig>,
}

// ── Events ──────────────────────────────────────────────────────────────

#[event]
pub struct OracleInitialized {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub feed: Pubkey,
    pub base_currency: String,
}

#[event]
pub struct FeedUpdated {
    pub config: Pubkey,
    pub old_feed: Pubkey,
    pub new_feed: Pubkey,
}

#[event]
pub struct PriceUpdated {
    pub config: Pubkey,
    pub price: i128,
    pub decimals: u8,
    pub source: String,
}

#[event]
pub struct PriceQueried {
    pub config: Pubkey,
    pub price: i128,
    pub decimals: u8,
    pub base_currency: String,
    pub age_seconds: i64,
}

#[event]
pub struct MintAmountCalculated {
    pub collateral_amount: u64,
    pub token_amount: u64,
    pub price: i128,
    pub base_currency: String,
}

// ── Errors ──────────────────────────────────────────────────────────────

#[error_code]
pub enum OracleError {
    #[msg("Oracle feed data is stale")]
    StaleFeed,

    #[msg("Invalid price value")]
    InvalidPrice,

    #[msg("Arithmetic overflow")]
    MathOverflow,

    #[msg("Currency string too long (max 10 chars)")]
    CurrencyTooLong,

    #[msg("Staleness threshold must be positive")]
    InvalidThreshold,

    #[msg("Failed to parse Switchboard feed data")]
    InvalidFeedData,
}
