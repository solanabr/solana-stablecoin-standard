use anchor_lang::prelude::*;

#[error_code]
pub enum OracleError {
    /// 6000 — Not authorized
    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    /// 6001 — Oracle feed is stale
    #[msg("Oracle feed is stale: exceeds max_staleness threshold")]
    StaleFeed,

    /// 6002 — Confidence interval too wide
    #[msg("Oracle confidence interval exceeds max_confidence_bps threshold")]
    ConfidenceTooWide,

    /// 6003 — Oracle is disabled
    #[msg("Oracle configuration is currently disabled")]
    OracleDisabled,

    /// 6004 — Invalid feed address
    #[msg("Invalid Switchboard aggregator account")]
    InvalidFeed,

    /// 6005 — Invalid price (zero or negative)
    #[msg("Oracle returned invalid price (zero or negative)")]
    InvalidPrice,

    /// 6006 — Amount cannot be zero
    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    /// 6007 — Currency string too long
    #[msg("Base currency string exceeds maximum length (8 chars)")]
    CurrencyTooLong,

    /// 6008 — Arithmetic overflow
    #[msg("Arithmetic overflow in price calculation")]
    ArithmeticOverflow,

    /// 6009 — Stablecoin state mismatch
    #[msg("Stablecoin state does not match oracle config")]
    StateMismatch,
}
