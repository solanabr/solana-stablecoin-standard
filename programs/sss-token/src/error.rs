use anchor_lang::prelude::*;

#[error_code]
pub enum SssError {
    #[msg("Unauthorized: signer does not hold the required role")]
    Unauthorized,

    #[msg("Contract is paused")]
    ContractPaused,

    #[msg("Minter quota exceeded")]
    QuotaExceeded,

    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,

    #[msg("Address is not blacklisted")]
    NotBlacklisted,

    #[msg("Operation not available for this preset — SSS-2 required")]
    InvalidPreset,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Name exceeds maximum length")]
    NameTooLong,

    #[msg("Symbol exceeds maximum length")]
    SymbolTooLong,

    #[msg("URI exceeds maximum length")]
    UriTooLong,

    #[msg("Reason exceeds maximum length")]
    ReasonTooLong,

    #[msg("Invalid decimals — must be <= 9")]
    InvalidDecimals,

    #[msg("Minter is not active")]
    MinterInactive,

    #[msg("Transfer hook program mismatch")]
    TransferHookMismatch,
}
