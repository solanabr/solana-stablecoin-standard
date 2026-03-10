use anchor_lang::prelude::*;

#[error_code]
pub enum SSSError {
    #[msg("Invalid preset: must be 1 (Minimal) or 2 (Compliant)")]
    InvalidPreset,

    #[msg("Invalid decimals: must be between 0 and 9")]
    InvalidDecimals,

    #[msg("Operations are paused")]
    Paused,

    #[msg("Operations are not paused")]
    NotPaused,

    #[msg("Unauthorized: caller is not the authority")]
    NotAuthority,

    #[msg("Unauthorized: caller is not the master minter")]
    NotMasterMinter,

    #[msg("Unauthorized: caller is not the pauser")]
    NotPauser,

    #[msg("Unauthorized: caller is not the blacklister")]
    NotBlacklister,

    #[msg("Unauthorized: caller does not have the required role")]
    Unauthorized,

    #[msg("Minter is not enabled")]
    MinterDisabled,

    #[msg("Minting quota exceeded")]
    QuotaExceeded,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("No pending authority transfer")]
    NoPendingAuthority,

    #[msg("Caller is not the pending authority")]
    NotPendingAuthority,

    #[msg("Feature not available for this preset")]
    PresetFeatureUnavailable,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Hook program is required for SSS-2 preset")]
    HookProgramRequired,

    #[msg("Name exceeds maximum length")]
    NameTooLong,

    #[msg("Symbol exceeds maximum length")]
    SymbolTooLong,

    #[msg("URI exceeds maximum length")]
    UriTooLong,
}
