use anchor_lang::prelude::*;

/// Custom error codes for the SSS Token program.
/// Each failure path has its own descriptive error variant.
#[error_code]
pub enum SssError {
    // ── Authorization Errors ──────────────────────────────────────────
    #[msg("Unauthorized: caller is not the master authority")]
    UnauthorizedMasterAuthority,

    #[msg("Unauthorized: caller is not an authorized minter")]
    UnauthorizedMinter,

    #[msg("Unauthorized: caller is not an authorized burner")]
    UnauthorizedBurner,

    #[msg("Unauthorized: caller is not the pauser")]
    UnauthorizedPauser,

    #[msg("Unauthorized: caller is not the blacklister")]
    UnauthorizedBlacklister,

    #[msg("Unauthorized: caller is not the seizer")]
    UnauthorizedSeizer,

    // ── State Errors ──────────────────────────────────────────────────
    #[msg("Operations are paused")]
    Paused,

    #[msg("Operations are not paused")]
    NotPaused,

    #[msg("Minter quota exceeded")]
    MinterQuotaExceeded,

    #[msg("Minter not found")]
    MinterNotFound,

    #[msg("Maximum number of minters reached")]
    MaxMintersReached,

    #[msg("Maximum number of burners reached")]
    MaxBurnersReached,

    #[msg("Minting would exceed the supply cap")]
    SupplyCapExceeded,

    // ── Feature Gate Errors ───────────────────────────────────────────
    #[msg("Compliance module not enabled: permanent delegate is required")]
    ComplianceNotEnabled,

    // ── Blacklist Errors ──────────────────────────────────────────────
    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,

    // ── Validation Errors ─────────────────────────────────────────────
    #[msg("Token name exceeds maximum length of 32 characters")]
    NameTooLong,

    #[msg("Token symbol exceeds maximum length of 10 characters")]
    SymbolTooLong,

    #[msg("Metadata URI exceeds maximum length of 200 characters")]
    UriTooLong,

    #[msg("Blacklist reason exceeds maximum length of 128 characters")]
    ReasonTooLong,

    #[msg("Mint amount must be greater than zero")]
    ZeroMintAmount,

    #[msg("Burn amount must be greater than zero")]
    ZeroBurnAmount,

    #[msg("Invalid decimals value")]
    InvalidDecimals,

    // ── Arithmetic Errors ─────────────────────────────────────────────
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
