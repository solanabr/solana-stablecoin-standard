use anchor_lang::prelude::*;

#[error_code]
pub enum SssError {
    #[msg("Stablecoin is paused")]
    Paused,

    #[msg("Caller lacks the required role")]
    Unauthorized,

    #[msg("Compliance module not enabled — initialize with enable_transfer_hook or enable_permanent_delegate")]
    ComplianceNotEnabled,

    #[msg("Permanent delegate not configured on this stablecoin")]
    PermanentDelegateNotEnabled,

    #[msg("Transfer hook not configured on this stablecoin")]
    TransferHookNotEnabled,

    #[msg("Minter cap exceeded")]
    MintCapExceeded,

    #[msg("Minter record is inactive")]
    MinterInactive,

    #[msg("Address is already on the blacklist")]
    AlreadyBlacklisted,

    #[msg("Address is not on the blacklist")]
    NotBlacklisted,

    #[msg("Account must be frozen before seizing")]
    AccountNotFrozen,

    #[msg("Name exceeds max length")]
    NameTooLong,

    #[msg("Symbol exceeds max length")]
    SymbolTooLong,

    #[msg("URI exceeds max length")]
    UriTooLong,

    #[msg("Decimals out of valid range (0-9)")]
    InvalidDecimals,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Math overflow")]
    MathOverflow,
}
