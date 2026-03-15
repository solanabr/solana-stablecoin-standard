use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    // ─── Authorization ───────────────────────────────────────────
    #[msg("Unauthorized: caller does not have the required role")]
    Unauthorized,

    #[msg("Unauthorized: only the master authority can perform this action")]
    NotMasterAuthority,

    // ─── Operational ─────────────────────────────────────────────
    #[msg("Token operations are currently paused")]
    Paused,

    #[msg("Token operations are not paused")]
    NotPaused,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Burn amount exceeds account balance")]
    InsufficientBalance,

    #[msg("Minter has exceeded their mint quota")]
    MintQuotaExceeded,

    // ─── Compliance (SSS-2) ──────────────────────────────────────
    #[msg("Compliance features are not enabled on this stablecoin (requires SSS-2)")]
    ComplianceNotEnabled,

    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,

    #[msg("Address is not blacklisted")]
    NotBlacklisted,

    #[msg("Cannot seize from a non-blacklisted account")]
    SeizeRequiresBlacklist,

    #[msg("Permanent delegate not configured on this mint")]
    NoPermanentDelegate,

    #[msg("Source token account owner does not match the blacklisted address")]
    SourceOwnerMismatch,

    #[msg("Reason string exceeds maximum length of 64 bytes")]
    ReasonTooLong,

    // ─── Configuration ───────────────────────────────────────────
    #[msg("Invalid preset configuration")]
    InvalidPreset,

    #[msg("Name exceeds maximum length of 32 bytes")]
    NameTooLong,

    #[msg("Symbol exceeds maximum length of 10 bytes")]
    SymbolTooLong,

    #[msg("Invalid decimals value (must be 0-18)")]
    InvalidDecimals,

    #[msg("Transfer hook program must be provided for SSS-2 configuration")]
    TransferHookRequired,

    // ─── Account State ───────────────────────────────────────────
    #[msg("Account is already frozen")]
    AlreadyFrozen,

    #[msg("Account is not frozen")]
    NotFrozen,

    #[msg("Arithmetic overflow")]
    Overflow,
}
