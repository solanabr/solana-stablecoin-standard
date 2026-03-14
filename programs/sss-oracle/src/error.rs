use anchor_lang::prelude::*;

#[error_code]
pub enum OracleError {
    #[msg("Price feed is stale (exceeds max_staleness_secs)")]
    StalePriceFeed,

    #[msg("Price deviates beyond acceptable threshold")]
    PriceDeviationExceeded,

    #[msg("Price feed confidence interval is too wide")]
    LowConfidence,

    #[msg("Price feed returned a non-positive price")]
    InvalidPrice,

    #[msg("Oracle account data could not be parsed")]
    InvalidOracleData,

    #[msg("Arithmetic overflow in price calculation")]
    MathOverflow,

    #[msg("Oracle config not initialized")]
    OracleNotConfigured,

    #[msg("Unauthorized: signer is not the oracle authority")]
    Unauthorized,

    #[msg("Oracle config already initialized")]
    OracleAlreadyInitialized,
}
