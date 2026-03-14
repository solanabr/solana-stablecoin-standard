use anchor_lang::prelude::*;

#[error_code]
pub enum SssError {
    // ── Auth ────────────────────────────────────────────────────────────────
    #[msg("Unauthorized: caller does not hold required role")]
    Unauthorized,

    #[msg("No pending authority transfer")]
    NoPendingAuthority,

    #[msg("Only the pending authority can accept this transfer")]
    WrongPendingAuthority,

    // ── Protocol state ──────────────────────────────────────────────────────
    #[msg("Protocol is paused — all minting and burning is suspended")]
    ProtocolPaused,

    #[msg("Minter is inactive or has been removed")]
    MinterInactive,

    #[msg("Minter quota exceeded — request amount is above remaining lifetime quota")]
    QuotaExceeded,

    #[msg("Cannot increase quota for an unlimited minter")]
    CannotIncreaseUnlimitedQuota,

    // ── SSS-2 Compliance ────────────────────────────────────────────────────
    #[msg("Compliance module is not enabled on this stablecoin")]
    ComplianceNotEnabled,

    #[msg("Address is already on the blacklist")]
    AlreadyBlacklisted,

    #[msg("Address is not on the blacklist")]
    NotBlacklisted,

    #[msg("Cannot seize tokens — account is not blacklisted")]
    SeizeRequiresBlacklist,

    #[msg("Permanent delegate not enabled — seize is unavailable")]
    PermanentDelegateNotEnabled,

    // ── Transfer Hook ───────────────────────────────────────────────────────
    #[msg("Transfer blocked — sender is blacklisted")]
    SenderBlacklisted,

    #[msg("Transfer blocked — recipient is blacklisted")]
    RecipientBlacklisted,

    // ── General ─────────────────────────────────────────────────────────────
    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("String field exceeds maximum length")]
    StringTooLong,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Minter not found")]
    MinterNotFound,
    
    #[msg("Minter is already inactive")]
    MinterAlreadyInactive,
}