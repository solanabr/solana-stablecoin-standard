use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("The stablecoin is currently paused")]
    Paused,

    #[msg("Unauthorized: caller does not have the required role")]
    Unauthorized,

    #[msg("Minter quota exceeded")]
    QuotaExceeded,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Compliance features are not enabled for this stablecoin")]
    ComplianceNotEnabled,

    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,

    #[msg("Address is not blacklisted")]
    NotBlacklisted,

    #[msg("Target account is blacklisted")]
    Blacklisted,

    #[msg("Name exceeds maximum length")]
    NameTooLong,

    #[msg("Symbol exceeds maximum length")]
    SymbolTooLong,

    #[msg("URI exceeds maximum length")]
    UriTooLong,

    #[msg("Invalid decimals (must be <= 9)")]
    InvalidDecimals,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Invalid role")]
    InvalidRole,

    #[msg("Already paused")]
    AlreadyPaused,

    #[msg("Not paused")]
    NotPaused,

    #[msg("Cannot seize from a non-blacklisted address")]
    SeizeNonBlacklisted,

    #[msg("Insufficient balance for burn")]
    InsufficientBalance,

    #[msg("Account is frozen")]
    AccountFrozen,

    #[msg("Account is not frozen")]
    AccountNotFrozen,

    #[msg("No pending authority transfer to accept or cancel")]
    NoPendingAuthority,

    #[msg("Minting would exceed the supply cap")]
    SupplyCapExceeded,

    #[msg("Allowlist mode is not enabled for this stablecoin")]
    AllowlistNotEnabled,

    #[msg("Address is not on the allowlist")]
    NotAllowlisted,

    #[msg("Not the pending authority")]
    NotPendingAuthority,

    #[msg("Blacklist reason exceeds maximum length")]
    ReasonTooLong,

    #[msg("Oracle price is stale")]
    OraclePriceStale,

    #[msg("Oracle price indicates depeg beyond tolerance")]
    OraclePriceDepegged,

    #[msg("Invalid oracle price feed account")]
    InvalidOracleFeed,

    #[msg("Role is not active")]
    RoleNotActive,
}
