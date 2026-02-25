use anchor_lang::prelude::*;

#[error_code]
pub enum OracleError {
    #[msg("Feed account data too small or invalid")]
    InvalidFeedData,

    #[msg("Oracle price is stale (exceeds max age)")]
    StaleFeedPrice,

    #[msg("Oracle returned a non-positive price")]
    NonPositivePrice,

    #[msg("Arithmetic overflow in price calculation")]
    MathOverflow,
}
