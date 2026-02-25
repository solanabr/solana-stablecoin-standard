use anchor_lang::prelude::*;
use crate::error::OracleError;

/// Byte offset of `latest_confirmed_round.result` (f64) in a
/// Switchboard V2 AggregatorAccountData.
///
/// Layout (abbreviated):
///   0..8     discriminator
///   ...
///   112..120 latest_confirmed_round.result (SwitchboardDecimal → f64 mantissa)
///
/// We only need the price float, so we skip the rest.
const RESULT_OFFSET: usize = 112;

/// Byte offset of `latest_confirmed_round.round_open_timestamp` (i64).
const TIMESTAMP_OFFSET: usize = 120;

/// Minimum account size we expect from a Switchboard aggregator.
const MIN_ACCOUNT_SIZE: usize = 128;

/// Read the latest price from a Switchboard V2 aggregator account.
/// Returns the price as a fixed-point i64 with `decimals` precision.
pub fn read_switchboard_price(account_data: &[u8], decimals: u8) -> Result<i64> {
    require!(account_data.len() >= MIN_ACCOUNT_SIZE, OracleError::InvalidFeedData);

    let result_bytes: [u8; 8] = account_data[RESULT_OFFSET..RESULT_OFFSET + 8]
        .try_into()
        .unwrap();
    let price_f64 = f64::from_le_bytes(result_bytes);

    require!(price_f64 > 0.0, OracleError::NonPositivePrice);

    let multiplier = 10_f64.powi(decimals as i32);
    let price_fixed = (price_f64 * multiplier) as i64;

    Ok(price_fixed)
}

/// Read the latest round timestamp from a Switchboard V2 aggregator account.
pub fn read_switchboard_timestamp(account_data: &[u8]) -> Result<i64> {
    require!(account_data.len() >= MIN_ACCOUNT_SIZE, OracleError::InvalidFeedData);

    let ts_bytes: [u8; 8] = account_data[TIMESTAMP_OFFSET..TIMESTAMP_OFFSET + 8]
        .try_into()
        .unwrap();
    Ok(i64::from_le_bytes(ts_bytes))
}
