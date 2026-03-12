//! Shared math utilities: checked arithmetic helpers used across SSS programs.

use anchor_lang::prelude::*;

#[error_code]
pub enum MathError {
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Division by zero")]
    DivisionByZero,
}

/// Checked multiplication then division. Rounds down.
pub fn mul_div_floor(a: u64, b: u64, c: u64) -> Result<u64> {
    require!(c > 0, MathError::DivisionByZero);
    let result = (a as u128)
        .checked_mul(b as u128)
        .ok_or(MathError::Overflow)?
        .checked_div(c as u128)
        .ok_or(MathError::DivisionByZero)?;
    u64::try_from(result).map_err(|_| MathError::Overflow.into())
}

/// Checked multiplication then division. Rounds up.
pub fn mul_div_ceil(a: u64, b: u64, c: u64) -> Result<u64> {
    require!(c > 0, MathError::DivisionByZero);
    let numerator = (a as u128)
        .checked_mul(b as u128)
        .ok_or(MathError::Overflow)?;
    let result = numerator
        .checked_add(c as u128 - 1)
        .ok_or(MathError::Overflow)?
        .checked_div(c as u128)
        .ok_or(MathError::DivisionByZero)?;
    u64::try_from(result).map_err(|_| MathError::Overflow.into())
}

/// Basis points to actual amount (rounds down).
pub fn bps_of(amount: u64, bps: u16) -> Result<u64> {
    mul_div_floor(amount, bps as u64, 10_000)
}
