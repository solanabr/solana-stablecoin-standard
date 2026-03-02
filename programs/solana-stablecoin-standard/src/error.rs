use anchor_lang::prelude::*;

#[error_code]
pub enum SssError {
    #[msg("Unauthorized: caller does not have required role")]
    Unauthorized,
    #[msg("Transfers are currently paused")]
    TransfersPaused,
    #[msg("Address is blacklisted")]
    Blacklisted,
    #[msg("SSS-2 feature not enabled for this token")]
    Sss2NotEnabled,
    #[msg("Maximum supply would be exceeded")]
    MaxSupplyExceeded,
    #[msg("Minter quota would be exceeded")]
    MinterQuotaExceeded,
    #[msg("Invalid preset configuration")]
    InvalidPreset,
    #[msg("Mint authority not set")]
    NoMintAuthority,
    #[msg("Freeze authority not set")]
    NoFreezeAuthority,
    #[msg("Transfer hook program mismatch")]
    TransferHookMismatch,
    #[msg("Cannot remove last authority")]
    CannotRemoveLastAuthority,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Decimals must be between 0 and 9")]
    InvalidDecimals,
}
