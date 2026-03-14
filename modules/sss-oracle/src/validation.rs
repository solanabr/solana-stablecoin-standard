use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::OracleError;
use crate::types::{OracleConfig, PriceData};

/// Validate a price feed update against the oracle configuration.
///
/// Checks:
/// 1. Price is positive
/// 2. Feed is not stale (within max_staleness seconds of current_time)
/// 3. Confidence ratio is acceptable (confidence / |price| <= MAX_CONFIDENCE_RATIO_BPS)
/// 4. Price deviation from expected is within tolerance (max_deviation_bps)
///
/// Returns the validated PriceData if all checks pass.
pub fn validate_price_feed(
    oracle_config: &OracleConfig,
    price_data: &PriceData,
    current_time: i64,
) -> Result<()> {
    // Check 1: Price must be positive
    require!(price_data.price > 0, OracleError::InvalidPrice);

    // Check 2: Staleness check
    let age = current_time.saturating_sub(price_data.publish_time);
    let max_staleness = if oracle_config.max_staleness > 0 {
        oracle_config.max_staleness
    } else {
        MAX_STALENESS_SECONDS
    };
    require!(age <= max_staleness, OracleError::StalePriceFeed);

    // Check 3: Confidence ratio
    // confidence / price * BPS_DENOMINATOR <= MAX_CONFIDENCE_RATIO_BPS
    let price_abs = price_data.price as u64;
    if price_abs > 0 {
        let confidence_ratio_bps = price_data
            .confidence
            .checked_mul(BPS_DENOMINATOR)
            .ok_or(OracleError::MathOverflow)?
            / price_abs;
        require!(
            confidence_ratio_bps <= MAX_CONFIDENCE_RATIO_BPS,
            OracleError::LowConfidence
        );
    }

    // Check 4: Deviation from expected price
    if oracle_config.expected_price > 0 {
        let scaled_price = price_data
            .to_scaled_u64(oracle_config.price_decimals)
            .ok_or(OracleError::MathOverflow)?;

        let max_deviation = if oracle_config.max_deviation_bps > 0 {
            oracle_config.max_deviation_bps
        } else {
            MAX_DEVIATION_BPS
        };

        let deviation = compute_deviation_bps(scaled_price, oracle_config.expected_price)?;
        require!(
            deviation <= max_deviation,
            OracleError::PriceDeviationExceeded
        );
    }

    Ok(())
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

/// Parse Pyth price feed data from raw account bytes.
/// Pyth V2 price account layout (simplified):
///   - Bytes 0-3:   magic number (0xa1b2c3d4)
///   - Bytes 208-215: price (i64, little-endian)
///   - Bytes 216-223: confidence (u64, little-endian)
///   - Bytes 224-227: exponent (i32, little-endian)
///   - Bytes 232-239: publish_time (i64, little-endian)
///
/// Note: This parser is intentionally simplified for demonstration.
/// Production code should use the official pyth-sdk-solana crate.
pub fn parse_pyth_price(data: &[u8]) -> Result<PriceData> {
    require!(data.len() >= 240, OracleError::InvalidOracleData);

    // Verify Pyth magic number
    let magic = u32::from_le_bytes(
        data[0..4].try_into().map_err(|_| OracleError::InvalidOracleData)?,
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

/// Parse Switchboard V2 aggregator result from raw account bytes.
/// Switchboard aggregator layout (simplified):
///   - Bytes 197-204: result (f64 as le bytes → converted to i64 for consistency)
///   - Bytes 213-220: current_round.round_open_timestamp (i64)
///
/// Note: This parser is intentionally simplified. Production code should
/// use the official switchboard-v2 or switchboard-on-demand SDK.
pub fn parse_switchboard_result(data: &[u8]) -> Result<PriceData> {
    require!(data.len() >= 221, OracleError::InvalidOracleData);

    let result_bytes: [u8; 8] = data[197..205]
        .try_into()
        .map_err(|_| OracleError::InvalidOracleData)?;
    let result_f64 = f64::from_le_bytes(result_bytes);

    // Convert float to scaled integer with 9 decimals of precision
    let scale = 1_000_000_000i64;
    let price = (result_f64 * scale as f64) as i64;

    let timestamp = i64::from_le_bytes(
        data[213..221]
            .try_into()
            .map_err(|_| OracleError::InvalidOracleData)?,
    );

    Ok(PriceData {
        price,
        confidence: 0, // Switchboard V2 doesn't have a confidence interval in same way
        exponent: -9,
        publish_time: timestamp,
    })
}

/// Derive the oracle config PDA address.
pub fn get_oracle_config_address(
    stablecoin_config: &Pubkey,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[ORACLE_CONFIG_SEED, stablecoin_config.as_ref()],
        program_id,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deviation_bps_exact() {
        let result = compute_deviation_bps(1000, 1000).unwrap();
        assert_eq!(result, 0);
    }

    #[test]
    fn test_deviation_bps_five_percent() {
        // 1050 vs 1000 = 5% = 500 bps
        let result = compute_deviation_bps(1050, 1000).unwrap();
        assert_eq!(result, 500);
    }

    #[test]
    fn test_deviation_bps_below_expected() {
        // 950 vs 1000 = 5% = 500 bps
        let result = compute_deviation_bps(950, 1000).unwrap();
        assert_eq!(result, 500);
    }

    #[test]
    fn test_price_data_scaling() {
        let pd = PriceData {
            price: 520000,
            confidence: 100,
            exponent: -4,
            publish_time: 0,
        };
        // 520000 * 10^(-4) = 52.0
        // Scaled to 6 decimals: 52_000_000
        let scaled = pd.to_scaled_u64(6).unwrap();
        assert_eq!(scaled, 52_000_000);
    }

    #[test]
    fn test_price_data_negative_rejected() {
        let pd = PriceData {
            price: -100,
            confidence: 0,
            exponent: 0,
            publish_time: 0,
        };
        assert!(pd.to_scaled_u64(6).is_none());
    }
}
