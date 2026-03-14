use anchor_lang::prelude::*;

#[error_code]
pub enum OracleError {
    #[msg("Price feed is stale (exceeds MAX_STALENESS_SECONDS)")]
    StalePriceFeed,

    #[msg("Price deviates beyond acceptable threshold")]
    PriceDeviationExceeded,

    #[msg("Price feed confidence interval is too wide")]
    LowConfidence,

    #[msg("Price feed returned a non-positive price")]
    InvalidPrice,

    #[msg("Oracle account data could not be parsed")]
    InvalidOracleData,

    #[msg("Oracle feed does not match the expected feed address")]
    OracleFeedMismatch,

    #[msg("Arithmetic overflow in price calculation")]
    MathOverflow,

    #[msg("Oracle config not initialized")]
    OracleNotConfigured,
}
