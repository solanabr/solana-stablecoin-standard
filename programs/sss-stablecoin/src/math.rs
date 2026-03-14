//! Math utilities for SSS Stablecoin

use crate::error::StablecoinError;
use anchor_lang::prelude::*;

/// Compute quota update after a mint operation
///
/// Returns (new_window_start_ts, new_minted_in_window)
/// Handles window reset when elapsed time exceeds window_seconds
pub fn compute_quota_update(
    now: i64,
    window_start_ts: i64,
    window_seconds: i64,
    minted_in_window: u64,
    quota_amount: u64,
    amount: u64,
) -> Result<(i64, u64)> {
    let should_reset = now.saturating_sub(window_start_ts) >= window_seconds;
    let next_window_start = if should_reset { now } else { window_start_ts };
    let next_minted = if should_reset { 0 } else { minted_in_window };
    let updated = next_minted
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;

    if updated > quota_amount {
        return Err(StablecoinError::QuotaExceeded.into());
    }

    Ok((next_window_start, updated))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quota_resets_when_window_elapsed() {
        let result = compute_quota_update(100, 0, 60, 50, 100, 10).unwrap();
        assert_eq!(result.0, 100);
        assert_eq!(result.1, 10);
    }

    #[test]
    fn quota_accumulates_within_window() {
        let result = compute_quota_update(10, 0, 60, 50, 100, 10).unwrap();
        assert_eq!(result.0, 0);
        assert_eq!(result.1, 60);
    }

    #[test]
    fn quota_fails_when_exceeded() {
        let result = compute_quota_update(10, 0, 60, 95, 100, 10);
        assert!(result.is_err());
    }

    #[test]
    fn quota_exactly_at_limit_succeeds() {
        let result = compute_quota_update(10, 0, 60, 50, 100, 50).unwrap();
        assert_eq!(result.1, 100);
    }
}
