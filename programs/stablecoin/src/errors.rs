use anchor_lang::prelude::*;

#[error_code]
pub enum SSSError {
    #[msg("Token is paused")]
    TokenPaused,
    #[msg("Address is blacklisted")]
    AddressBlacklisted,
    #[msg("Feature not enabled for this preset")]
    FeatureNotEnabled,
    #[msg("Unauthorized — insufficient role")]
    Unauthorized,
    #[msg("Minter allowance exceeded")]
    AllowanceExceeded,
    #[msg("Minter is not active")]
    MinterNotActive,
    #[msg("Invalid preset configuration")]
    InvalidPreset,
    #[msg("Account is not blacklisted (cannot seize)")]
    NotBlacklisted,
    #[msg("Pending owner mismatch")]
    PendingOwnerMismatch,
    #[msg("Reason string too long (max 128 chars)")]
    ReasonTooLong,
    #[msg("Cannot blacklist the treasury")]
    CannotBlacklistTreasury,
    #[msg("Name too long (max 32 chars)")]
    NameTooLong,
    #[msg("Symbol too long (max 10 chars)")]
    SymbolTooLong,
    #[msg("URI too long (max 200 chars)")]
    UriTooLong,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("No pending owner set")]
    NoPendingOwner,
    #[msg("Transfer hook and confidential transfers are incompatible")]
    IncompatibleExtensions,
}
