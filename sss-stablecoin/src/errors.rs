use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Unauthorized: caller does not have the required role")]
    Unauthorized,
    #[msg("Token operations are paused")]
    Paused,
    #[msg("Minter quota exceeded")]
    QuotaExceeded,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Minter not found")]
    MinterNotFound,
    #[msg("Already paused")]
    AlreadyPaused,
    #[msg("Not paused")]
    NotPaused,
    #[msg("Invalid role")]
    InvalidRole,
    #[msg("Compliance module not enabled")]
    ComplianceNotEnabled,
    #[msg("Blacklisted address")]
    BlacklistedAddress,
    #[msg("Account must be frozen before seizure")]
    AccountNotFrozen,
    #[msg("Role not found")]
    RoleNotFound,
    #[msg("Authority transfer already proposed")]
    AuthorityTransferAlreadyProposed,
    #[msg("Authority transfer not proposed")]
    AuthorityTransferNotProposed,
}
