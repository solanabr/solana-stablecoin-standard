use anchor_lang::prelude::*;

#[error_code]
pub enum SSSError {
    #[msg("Stablecoin operations are paused")]
    Paused,

    #[msg("Stablecoin operations are not paused")]
    NotPaused,

    #[msg("Unauthorized: caller lacks required role")]
    Unauthorized,

    #[msg("Invalid authority")]
    InvalidAuthority,

    #[msg("Name exceeds maximum length")]
    NameTooLong,

    #[msg("Symbol exceeds maximum length")]
    SymbolTooLong,

    #[msg("URI exceeds maximum length")]
    UriTooLong,

    #[msg("Mint amount exceeds minter quota")]
    QuotaExceeded,

    #[msg("Mint amount would overflow total supply")]
    MintOverflow,

    #[msg("Mint would exceed supply cap")]
    SupplyCapExceeded,

    #[msg("Burn amount exceeds account balance")]
    InsufficientBalance,

    #[msg("Account is already on the blacklist")]
    AlreadyBlacklisted,

    #[msg("Account is not on the blacklist")]
    NotBlacklisted,

    #[msg("Compliance module is not enabled for this stablecoin")]
    ComplianceNotEnabled,

    #[msg("Transfer hook is not enabled for this stablecoin")]
    TransferHookNotEnabled,

    #[msg("Permanent delegate is not enabled for this stablecoin")]
    PermanentDelegateNotEnabled,

    #[msg("Account is frozen")]
    AccountFrozen,

    #[msg("Account is not frozen")]
    AccountNotFrozen,

    #[msg("Account is blacklisted")]
    AccountBlacklisted,

    #[msg("Invalid decimals value (max 9)")]
    InvalidDecimals,

    #[msg("Minter already exists")]
    MinterAlreadyExists,

    #[msg("Minter not found")]
    MinterNotFound,

    #[msg("Reason string exceeds maximum length")]
    ReasonTooLong,

    #[msg("Zero amount not allowed")]
    ZeroAmount,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("No pending authority to accept")]
    NoPendingAuthority,

    #[msg("Caller is not the pending authority")]
    NotPendingAuthority,

    #[msg("Supply cap must be >= current supply")]
    InvalidSupplyCap,
}
