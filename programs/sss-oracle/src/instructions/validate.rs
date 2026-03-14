use anchor_lang::prelude::*;

use crate::error::OracleError;
use crate::events::PriceValidated;
use crate::state::OraclePriceConfig;

/// Basis point denominator (10000 = 100%)
const BPS_DENOMINATOR: u64 = 10_000;

/// Maximum confidence-to-price ratio in basis points (200 = 2%)
const MAX_CONFIDENCE_RATIO_BPS: u64 = 200;

/// Parsed price data from a Pyth price feed
struct PriceData {
    pub price: i64,
    pub confidence: u64,
    pub exponent: i32,
    pub publish_time: i64,
}

impl PriceData {
    /// Convert price to a u64 scaled to the given number of decimals.
    /// Returns None if price is negative or overflow occurs.
    fn to_scaled_u64(&self, target_decimals: u8) -> Option<u64> {
        if self.price <= 0 {
            return None;
        }

        let price = self.price as u64;
        let expo = self.exponent;

        // Price is: price * 10^exponent
        // We want: result * 10^(-target_decimals)
        // So: result = price * 10^(exponent + target_decimals)
        let shift = expo + target_decimals as i32;

        if shift >= 0 {
            price.checked_mul(10u64.checked_pow(shift as u32)?)
        } else {
            let divisor = 10u64.checked_pow((-shift) as u32)?;
            Some(price / divisor)
        }
    }
}

/// Parse Pyth V2 price feed data from raw account bytes.
///
/// Layout (simplified):
///   - Bytes 0-3:     magic number (0xa1b2c3d4)
///   - Bytes 208-215: price (i64, little-endian)
///   - Bytes 216-223: confidence (u64, little-endian)
///   - Bytes 224-227: exponent (i32, little-endian)
///   - Bytes 232-239: publish_time (i64, little-endian)
fn parse_pyth_price(data: &[u8]) -> Result<PriceData> {
    require!(data.len() >= 240, OracleError::InvalidOracleData);

    // Verify Pyth magic number
    let magic = u32::from_le_bytes(
        data[0..4]
            .try_into()
            .map_err(|_| OracleError::InvalidOracleData)?,
    );
    require!(magic == 0xa1b2c3d4, OracleError::InvalidOracleData);

    let price = i64::from_le_bytes(
        data[208..216]
            .try_into()
            .map_err(|_| OracleError::InvalidOracleData)?,
    );
    let confidence = u64::from_le_bytes(
        data[216..224]
            .try_into()
            .map_err(|_| OracleError::InvalidOracleData)?,
    );
    let exponent = i32::from_le_bytes(
        data[224..228]
            .try_into()
            .map_err(|_| OracleError::InvalidOracleData)?,
    );
    let publish_time = i64::from_le_bytes(
        data[232..240]
            .try_into()
            .map_err(|_| OracleError::InvalidOracleData)?,
    );

    Ok(PriceData {
        price,
        confidence,
        exponent,
        publish_time,
    })
}

/// Compute the absolute deviation between two prices in basis points.
/// deviation_bps = |actual - expected| / expected * 10000
fn compute_deviation_bps(actual: u64, expected: u64) -> Result<u64> {
    if expected == 0 {
        return Ok(0);
    }

    let diff = if actual > expected {
        actual - expected
    } else {
        expected - actual
    };

    diff.checked_mul(BPS_DENOMINATOR)
        .map(|n| n / expected)
        .ok_or_else(|| error!(OracleError::MathOverflow))
}

#[derive(Accounts)]
pub struct ValidatePrice<'info> {
    #[account(
        mut,
        constraint = oracle_config.enabled @ OracleError::OracleNotConfigured,
    )]
    pub oracle_config: Account<'info, OraclePriceConfig>,

    /// The Pyth price feed account. Verified against oracle_config.price_feed.
    /// CHECK: Validated manually by comparing key to oracle_config.price_feed
    /// and parsing the account data for Pyth magic number.
    #[account(
        constraint = price_feed_account.key() == oracle_config.price_feed @ OracleError::InvalidOracleData,
    )]
    pub price_feed_account: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ValidatePrice>) -> Result<()> {
    let oracle = &mut ctx.accounts.oracle_config;
    let feed_data = ctx.accounts.price_feed_account.try_borrow_data()?;
    let price_data = parse_pyth_price(&feed_data)?;

    // Check 1: Price must be positive
    require!(price_data.price > 0, OracleError::InvalidPrice);

    // Check 2: Staleness
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;
    let age = current_time.saturating_sub(price_data.publish_time);
    require!(
        age <= oracle.max_staleness_secs as i64,
        OracleError::StalePriceFeed
    );

    // Check 3: Confidence ratio
    let price_abs = price_data.price as u64;
    let mut is_valid = true;

    if price_abs > 0 {
        let confidence_ratio_bps = price_data
            .confidence
            .checked_mul(BPS_DENOMINATOR)
            .ok_or(OracleError::MathOverflow)?
            / price_abs;

        if confidence_ratio_bps > MAX_CONFIDENCE_RATIO_BPS {
            is_valid = false;
        }
    }

    // Check 4: Deviation from expected price
    let mut deviation_bps: u64 = 0;

    if oracle.expected_price > 0 {
        let scaled_price = price_data
            .to_scaled_u64(oracle.price_decimals)
            .ok_or(OracleError::MathOverflow)?;

        deviation_bps = compute_deviation_bps(scaled_price, oracle.expected_price)?;

        if deviation_bps > oracle.max_deviation_bps as u64 {
            is_valid = false;
        }
    }

    // Scale price for storage
    let validated_price = price_data
        .to_scaled_u64(oracle.price_decimals)
        .unwrap_or(0);

    // Update last validated fields
    oracle.last_validated_price = validated_price;
    oracle.last_validated_at = current_time;

    emit!(PriceValidated {
        oracle_config: ctx.accounts.oracle_config.key(),
        is_valid,
        price: validated_price,
        deviation_bps,
        age_secs: age,
    });

    Ok(())
}
