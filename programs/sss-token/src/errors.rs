use anchor_lang::prelude::*;

#[error_code]
pub enum SssError {
    // Access control
    #[msg("Unauthorized: caller does not have the required role")]
    Unauthorized,
    #[msg("Invalid authority for this operation")]
    InvalidAuthority,

    // Operational
    #[msg("Program is currently paused")]
    ProgramPaused,
    #[msg("Program is not paused")]
    ProgramNotPaused,

    // Minting
    #[msg("Minter is not active")]
    MinterNotActive,
    #[msg("Mint amount exceeds minter quota")]
    MintQuotaExceeded,
    #[msg("Mint amount must be greater than zero")]
    MintAmountZero,

    // Burn
    #[msg("Burn amount must be greater than zero")]
    BurnAmountZero,
    #[msg("Insufficient balance for burn")]
    InsufficientBalance,

    // Feature gating
    #[msg("Feature not enabled for this stablecoin preset")]
    FeatureNotEnabled,
    #[msg("Blacklist feature requires SSS-2 or higher preset")]
    BlacklistNotEnabled,
    #[msg("Transfer hook feature requires SSS-2 or higher preset")]
    TransferHookNotEnabled,
    #[msg("Confidential transfers require SSS-3 preset")]
    ConfidentialTransfersNotEnabled,

    // Blacklist (SSS-2)
    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,
    #[msg("Address is not blacklisted")]
    NotBlacklisted,
    #[msg("Cannot blacklist the master authority")]
    CannotBlacklistAuthority,

    // Validation
    #[msg("Name exceeds maximum length of 32 characters")]
    NameTooLong,
    #[msg("Symbol exceeds maximum length of 10 characters")]
    SymbolTooLong,
    #[msg("URI exceeds maximum length of 200 characters")]
    UriTooLong,
    #[msg("Reason exceeds maximum length of 128 characters")]
    ReasonTooLong,
    #[msg("Details exceeds maximum length of 256 characters")]
    DetailsTooLong,
    #[msg("Invalid decimals value")]
    InvalidDecimals,

    // Authority
    #[msg("Cannot transfer authority to the same address")]
    SameAuthority,
    #[msg("New authority cannot be the zero address")]
    ZeroAuthority,

    // Seize
    #[msg("Seize amount must be greater than zero")]
    SeizeAmountZero,
    #[msg("Source and destination accounts must be different")]
    SeizeSameAccount,

    // Arithmetic
    #[msg("Arithmetic overflow")]
    Overflow,
}
