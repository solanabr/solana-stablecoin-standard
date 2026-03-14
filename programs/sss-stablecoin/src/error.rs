//! Error definitions for SSS Stablecoin

use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    /// Caller is not authorized for this operation
    #[msg("Unauthorized")]
    Unauthorized,

    /// Program is currently paused
    #[msg("Program is paused")]
    Paused,

    /// Mint account does not match the config
    #[msg("Mint does not match config")]
    InvalidMint,

    /// Invalid treasury token account provided
    #[msg("Invalid treasury token account")]
    InvalidTreasury,

    /// Minter quota exceeded for current window
    #[msg("Quota exceeded for current window")]
    QuotaExceeded,

    /// Invalid quota configuration
    #[msg("Invalid quota configuration")]
    InvalidQuota,

    /// Arithmetic operation overflow
    #[msg("Arithmetic overflow")]
    MathOverflow,

    /// Compliance features are disabled for this stablecoin
    #[msg("Compliance features are disabled")]
    ComplianceDisabled,

    /// Permanent delegate extension is not enabled
    #[msg("Permanent delegate extension is disabled")]
    PermanentDelegateDisabled,

    /// Wallet is blacklisted and cannot transact
    #[msg("Wallet is blacklisted")]
    WalletBlacklisted,

    /// Wallet is not blacklisted (for seize operations requiring blacklist)
    #[msg("Wallet is not blacklisted")]
    WalletNotBlacklisted,

    /// Compliance record PDA is invalid or corrupted
    #[msg("Invalid compliance record")]
    InvalidComplianceRecord,

    /// Token account is invalid or does not match expected mint
    #[msg("Invalid token account")]
    InvalidTokenAccount,

    /// Failed to calculate mint account size
    #[msg("Mint account sizing failed")]
    MintSizingFailed,

    /// Preset and extension configuration mismatch
    #[msg("Invalid preset/extension configuration")]
    InvalidPresetConfiguration,
}
