use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct RefreshPrice<'info> {
    #[account(
        mut,
        seeds = [b"oracle-config", oracle_config.mint.as_ref()],
        bump = oracle_config.bump,
    )]
    pub oracle_config: Account<'info, OracleFeedConfig>,

    /// CHECK: Oracle feed account — validated by:
    /// 1. Address must match stored feed_address
    /// 2. Account owner must match expected oracle program
    #[account(
        constraint = feed_account.key() == oracle_config.feed_address @ OracleError::InvalidFeedData
    )]
    pub feed_account: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RefreshPrice>) -> Result<()> {
    let config = &mut ctx.accounts.oracle_config;

    require!(config.active, OracleError::OracleInactive);
    require!(!config.circuit_breaker_tripped, OracleError::CircuitBreakerTripped);

    // SECURITY: Validate feed account is owned by the correct oracle program
    let feed_owner = ctx.accounts.feed_account.owner;
    require!(
        config.validate_feed_owner(feed_owner),
        OracleError::InvalidFeedOwner
    );

    let feed_data = ctx.accounts.feed_account.try_borrow_data()?;
    let clock = Clock::get()?;

    let (price, confidence, feed_ts) = match config.provider {
        OracleProvider::Pyth => {
            let pyth = PythPriceData::parse(&feed_data)?;
            // Reject if Pyth reports non-trading status
            require!(pyth.is_trading(), OracleError::PythNotTrading);
            (pyth.to_normalized_price(), pyth.to_normalized_confidence(), pyth.publish_time)
        }
        OracleProvider::Switchboard => {
            let sb = SwitchboardResult::parse(&feed_data)?;
            (sb.to_normalized_price(), 0u64, sb.timestamp)
        }
    };

    // Validate staleness
    let age = clock.unix_timestamp.saturating_sub(feed_ts);
    require!(age <= config.max_staleness_secs as i64, OracleError::StalePrice);

    // Validate confidence band (Pyth only, if configured)
    if confidence > 0 && config.max_confidence_bps > 0 && price > 0 {
        let conf_bps = confidence
            .checked_mul(10000).ok_or(OracleError::Overflow)?
            .checked_div(price).ok_or(OracleError::Overflow)? as u16;
        require!(conf_bps <= config.max_confidence_bps, OracleError::ConfidenceTooWide);
    }

    // Circuit breaker check — trip if price outside hard bounds
    if config.circuit_breaker_min > 0 && price < config.circuit_breaker_min {
        config.circuit_breaker_tripped = true;
        msg!("CIRCUIT BREAKER TRIPPED: price {} below min {}", price, config.circuit_breaker_min);
        return Err(OracleError::CircuitBreakerTripped.into());
    }
    if config.circuit_breaker_max > 0 && price > config.circuit_breaker_max {
        config.circuit_breaker_tripped = true;
        msg!("CIRCUIT BREAKER TRIPPED: price {} above max {}", price, config.circuit_breaker_max);
        return Err(OracleError::CircuitBreakerTripped.into());
    }

    // Update cached price
    config.last_price = price;
    config.last_confidence = confidence;
    config.last_update_ts = clock.unix_timestamp;
    config.refresh_count = config.refresh_count.saturating_add(1);

    msg!(
        "Oracle refreshed: price={}, confidence={}, age={}s, refresh#{}",
        price, confidence, age, config.refresh_count
    );

    Ok(())
}
