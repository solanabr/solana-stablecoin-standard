use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Caller is not authorized for this operation")]
    Unauthorized, // 6000

    #[msg("Program is currently paused")]
    ProgramPaused, // 6001

    #[msg("Amount must be greater than zero")]
    InvalidAmount, // 6002

    #[msg("Minter quota exceeded")]
    QuotaExceeded, // 6003

    #[msg("Minter is not active")]
    MinterInactive, // 6004

    #[msg("Authority transfer already pending")]
    PendingAuthorityExists, // 6005

    #[msg("No pending authority transfer")]
    NoPendingAuthority, // 6006

    #[msg("Address is blacklisted")]
    Blacklisted, // 6007

    #[msg("Address is not blacklisted")]
    NotBlacklisted, // 6008

    #[msg("This instruction requires SSS-2 (compliance) configuration")]
    Sss2NotEnabled, // 6009

    #[msg("Permanent delegate not configured")]
    NoPermanentDelegate, // 6010

    #[msg("Transfer hook not configured")]
    NoTransferHook, // 6011

    #[msg("Role is not active")]
    RoleInactive, // 6012

    #[msg("Overflow in arithmetic operation")]
    MathOverflow, // 6013

    #[msg("String exceeds maximum length")]
    StringTooLong, // 6014
}
