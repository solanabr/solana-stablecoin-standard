use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct ValidatePrice<'info> {
    #[account(
        seeds = [b"oracle-config", oracle_config.mint.as_ref()],
        bump = oracle_config.bump,
    )]
    pub oracle_config: Account<'info, OracleFeedConfig>,

    /// CHECK: Oracle feed account — validated by address match + owner check
    #[account(
        constraint = feed_account.key() == oracle_config.feed_address @ OracleError::InvalidFeedData
    )]
    pub feed_account: UncheckedAccount<'info>,
}

/// Validates oracle price meets all requirements for safe mint/redeem.
/// Designed for CPI: returns PriceQuote via set_return_data.
///
/// Checks performed:
/// 1. Oracle is active and circuit breaker not tripped
/// 2. Feed account owner matches expected oracle program
/// 3. Price data is parseable and valid
/// 4. Pyth feed is in trading status
/// 5. Price is not stale (within max_staleness_secs)
/// 6. Confidence band is acceptable (within max_confidence_bps)
/// 7. Price deviation from peg is within tolerance (max_deviation_bps)
/// 8. Price is within circuit breaker bounds
pub fn handler(ctx: Context<ValidatePrice>) -> Result<()> {
    let config = &ctx.accounts.oracle_config;

    // 1. Active + circuit breaker check
    require!(config.active, OracleError::OracleInactive);
    require!(!config.circuit_breaker_tripped, OracleError::CircuitBreakerTripped);

    // 2. Feed owner validation
    let feed_owner = ctx.accounts.feed_account.owner;
    require!(
        config.validate_feed_owner(feed_owner),
        OracleError::InvalidFeedOwner
    );

    let feed_data = ctx.accounts.feed_account.try_borrow_data()?;
    let clock = Clock::get()?;

    // 3-4. Parse and validate feed data
    let (price, confidence, feed_ts) = match config.provider {
        OracleProvider::Pyth => {
            let pyth = PythPriceData::parse(&feed_data)?;
            require!(pyth.is_trading(), OracleError::PythNotTrading);
            (pyth.to_normalized_price(), pyth.to_normalized_confidence(), pyth.publish_time)
        }
        OracleProvider::Switchboard => {
            let sb = SwitchboardResult::parse(&feed_data)?;
            (sb.to_normalized_price(), 0u64, sb.timestamp)
        }
    };

    // 5. Staleness check
    let age = clock.unix_timestamp.saturating_sub(feed_ts);
    require!(age <= config.max_staleness_secs as i64, OracleError::StalePrice);

    // 6. Confidence band check
    let confidence_ok = if confidence > 0 && config.max_confidence_bps > 0 && price > 0 {
        let conf_bps = confidence
            .checked_mul(10000).ok_or(OracleError::Overflow)?
            .checked_div(price).ok_or(OracleError::Overflow)? as u16;
        conf_bps <= config.max_confidence_bps
    } else {
        true
    };
    require!(confidence_ok, OracleError::ConfidenceTooWide);

    // 7. Peg deviation check
    let target = config.target_price;
    let deviation_abs = if price > target {
        price.checked_sub(target).ok_or(OracleError::Overflow)?
    } else {
        target.checked_sub(price).ok_or(OracleError::Overflow)?
    };
    let deviation_bps = deviation_abs
        .checked_mul(10000).ok_or(OracleError::Overflow)?
        .checked_div(target).ok_or(OracleError::Overflow)? as u16;
    let within_peg = deviation_bps <= config.max_deviation_bps;
    require!(within_peg, OracleError::PriceDeviationExceeded);

    // 8. Circuit breaker bounds
    let circuit_breaker_ok =
        (config.circuit_breaker_min == 0 || price >= config.circuit_breaker_min) &&
        (config.circuit_breaker_max == 0 || price <= config.circuit_breaker_max);
    require!(circuit_breaker_ok, OracleError::CircuitBreakerTripped);

    // Return price quote via program return data
    let quote = PriceQuote {
        price,
        confidence,
        timestamp: feed_ts,
        within_peg,
        confidence_ok,
        circuit_breaker_ok,
    };
    let mut buf = Vec::with_capacity(64);
    quote.serialize(&mut buf)?;
    anchor_lang::solana_program::program::set_return_data(&buf);

    msg!(
        "Price VALIDATED: price={}, deviation={}bps/{}, conf={}",
        price, deviation_bps, config.max_deviation_bps, confidence
    );

    Ok(())
}
