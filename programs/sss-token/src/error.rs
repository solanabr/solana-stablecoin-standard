use anchor_lang::prelude::*;

#[error_code]
pub enum SSSError {
    #[msg("Token operations are paused")]
    Paused,

    #[msg("Unauthorized: caller does not have the required role")]
    Unauthorized,

    #[msg("Minter quota exceeded")]
    QuotaExceeded,

    #[msg("Compliance module not enabled for this token")]
    ComplianceNotEnabled,

    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,

    #[msg("Address is not blacklisted")]
    NotBlacklisted,

    #[msg("Invalid preset configuration")]
    InvalidPreset,

    #[msg("Maximum role capacity reached")]
    RoleCapacityReached,

    #[msg("Cannot seize from an account that is not frozen")]
    AccountNotFrozen,

    #[msg("Token name too long (max 32 chars)")]
    NameTooLong,

    #[msg("Token symbol too long (max 10 chars)")]
    SymbolTooLong,

    #[msg("Token URI too long (max 200 chars)")]
    UriTooLong,

    #[msg("Blacklist reason too long (max 64 chars)")]
    ReasonTooLong,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Arithmetic overflow")]
    MathOverflow,

    #[msg("Role not found")]
    RoleNotFound,

    #[msg("Use add_minter instruction to add minters (requires MinterInfo PDA)")]
    UseDedicatedAddMinter,

    #[msg("Address already holds this role")]
    AlreadyHasRole,
}
