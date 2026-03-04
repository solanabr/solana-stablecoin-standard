use anchor_lang::prelude::*;
use crate::errors::StablecoinError;

/// Get current day (Unix timestamp / 86400)
/// Used for daily quota tracking
pub fn get_current_day() -> i64 {
    Clock::get().unwrap().unix_timestamp / 86400
}

/// Check if amount is valid (> 0)
pub fn validate_amount(amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::InvalidAmount);
    Ok(())
}

/// Safe addition with overflow check
pub fn safe_add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or(StablecoinError::Overflow.into())
}

/// Safe subtraction with underflow check
pub fn safe_sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b).ok_or(StablecoinError::Underflow.into())
}

/// Safe multiplication with overflow check
pub fn safe_mul(a: u64, b: u64) -> Result<u64> {
    a.checked_mul(b).ok_or(StablecoinError::Overflow.into())
}

/// Safe division with zero check
pub fn safe_div(a: u64, b: u64) -> Result<u64> {
    require!(b > 0, StablecoinError::DivisionByZero);
    Ok(a / b)
}

/// Emit audit log event
pub fn emit_audit_event(
    action: &str,
    actor: Pubkey,
    target: Pubkey,
    amount: u64,
    data: &str,
) {
    msg!("AUDIT: {} | Actor: {} | Target: {} | Amount: {} | Data: {}",
        action, actor, target, amount, data);
}
