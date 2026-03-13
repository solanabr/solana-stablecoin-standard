use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Unauthorized access to this instruction.")]
    Unauthorized,
    #[msg("The minter has exceeded their assigned quota.")]
    QuotaExceeded,
    #[msg("The stablecoin system is currently paused.")]
    SystemPaused,
    #[msg("Account is frozen.")]
    AccountFrozen,
    #[msg("Account is on the blacklist.")]
    AccountBlacklisted,
    #[msg("Compliance module is not enabled for this stablecoin.")]
    ComplianceModuleDisabled,
    #[msg("Permanent delegate is not enabled for this stablecoin.")]
    PermanentDelegateDisabled,
    #[msg("Transfer hook is not enabled for this stablecoin.")]
    TransferHookDisabled,
    #[msg("Invalid authority provided.")]
    InvalidAuthority,
    #[msg("Math Overflow.")]
    MathOverflow,
}
