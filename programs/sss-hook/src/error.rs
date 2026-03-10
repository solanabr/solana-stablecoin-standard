use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Wallet is blacklisted")]
    Blacklisted,

    #[msg("Contract is paused")]
    ContractPaused,

    #[msg("Caller is not the blacklister")]
    NotBlacklister,

    #[msg("Invalid stablecoin config")]
    InvalidConfig,

    #[msg("Wallet is already blacklisted")]
    AlreadyBlacklisted,

    #[msg("Wallet is not blacklisted")]
    NotBlacklisted,

    #[msg("Not currently transferring")]
    IsNotCurrentlyTransferring,

    #[msg("Reason exceeds maximum length")]
    ReasonTooLong,
}
