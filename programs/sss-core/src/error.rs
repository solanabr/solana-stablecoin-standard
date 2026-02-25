use anchor_lang::prelude::*;

#[error_code]
pub enum SssError {
    #[msg("Operations are paused")]
    Paused,
    #[msg("Operations are not paused")]
    NotPaused,
    #[msg("Supply cap exceeded")]
    SupplyCapExceeded,
    #[msg("Unauthorized: missing required role")]
    Unauthorized,
    #[msg("Invalid preset value")]
    InvalidPreset,
    #[msg("Cannot remove the last admin")]
    LastAdmin,
    #[msg("Overflow in arithmetic operation")]
    ArithmeticOverflow,
    #[msg("Mint mismatch")]
    MintMismatch,
    #[msg("Invalid supply cap: must be >= current supply")]
    InvalidSupplyCap,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Invalid role value")]
    InvalidRole,
    #[msg("Invalid oracle price feed data")]
    InvalidOracleData,
    #[msg("Oracle price is stale or non-positive")]
    InvalidOraclePrice,
    #[msg("Minter quota exceeded")]
    QuotaExceeded,
    #[msg("Name exceeds maximum length of 32 characters")]
    NameTooLong,
    #[msg("Symbol exceeds maximum length of 10 characters")]
    SymbolTooLong,
    #[msg("URI exceeds maximum length of 200 characters")]
    UriTooLong,
}
