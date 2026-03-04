use anchor_lang::prelude::*;

#[error_code]
pub enum SssError {
    #[msg("Caller lacks the required role for this operation")]
    Unauthorized,

    #[msg("Token operations are paused")]
    Paused,

    #[msg("Account is frozen")]
    AccountFrozen,

    #[msg("Account is blacklisted")]
    Blacklisted,

    #[msg("SSS-2 feature used on an SSS-1 token — upgrade or redeploy")]
    PresetMismatch,

    #[msg("Role already assigned to this address")]
    RoleAlreadyAssigned,

    #[msg("Cannot remove the last admin")]
    LastAdmin,

    #[msg("Mint supply cap exceeded")]
    SupplyCapExceeded,

    #[msg("Invalid preset value — use 1 (SSS-1) or 2 (SSS-2)")]
    InvalidPreset,

    #[msg("Metadata URI exceeds max length")]
    UriTooLong,

    #[msg("Name exceeds max length")]
    NameTooLong,

    #[msg("Symbol exceeds max length")]
    SymbolTooLong,

    #[msg("Blacklist is full")]
    BlacklistFull,

    #[msg("Address not found in blacklist")]
    NotBlacklisted,

    #[msg("Seizure target has zero balance")]
    ZeroSeizure,

    #[msg("Arithmetic overflow")]
    Overflow,
}
