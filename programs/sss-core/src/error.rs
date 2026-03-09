use anchor_lang::prelude::*;

#[error_code]
pub enum SssError {
    #[msg("Unauthorized: caller does not have the required role")]
    Unauthorized,

    #[msg("Stablecoin is currently paused")]
    Paused,

    #[msg("Stablecoin is not paused")]
    NotPaused,

    #[msg("Invalid preset value")]
    InvalidPreset,

    #[msg("SSS-2/SSS-3 preset requires a transfer hook program")]
    TransferHookRequired,

    #[msg("Mint amount must be greater than zero")]
    ZeroAmount,

    #[msg("Insufficient balance for burn")]
    InsufficientBalance,

    #[msg("Role already granted to this holder")]
    RoleAlreadyGranted,

    #[msg("Overflow in total supply calculation")]
    Overflow,

    #[msg("Name too long (max 32 characters)")]
    NameTooLong,

    #[msg("Symbol too long (max 10 characters)")]
    SymbolTooLong,

    #[msg("URI too long (max 200 characters)")]
    UriTooLong,

    #[msg("Minter allowance exceeded")]
    AllowanceExceeded,

    #[msg("Wallet is blacklisted")]
    Blacklisted,

    #[msg("No pending admin to accept")]
    NoPendingAdmin,

    #[msg("Caller is not the pending admin")]
    NotPendingAdmin,

    #[msg("Treasury is required for SSS-2/SSS-3")]
    TreasuryRequired,

    #[msg("Feature not available for this preset")]
    PresetFeatureUnavailable,

    #[msg("Account is frozen")]
    AccountFrozen,

    #[msg("Account is not frozen")]
    AccountNotFrozen,

    #[msg("Invalid input: cannot use default/zero pubkey")]
    InvalidInput,

    #[msg("Cannot blacklist a protected address (admin or treasury)")]
    CannotBlacklistProtectedAddress,

    #[msg("Wallet must be blacklisted before seizure")]
    NotBlacklisted,

    #[msg("Blacklist entry account is required")]
    BlacklistEntryRequired,
}
