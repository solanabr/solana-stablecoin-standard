use anchor_lang::prelude::*;

#[error_code]
pub enum StableError {
    #[msg("Compliance is not enabled")]
    ComplianceNotEnabled,

    #[msg("Token-2022 program required for SSS1 and SSS2")]
    Token2022Required,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Minter quota exceeded")]
    QuotaExceeded,

    #[msg("Invalid role name")]
    InvalidRole,

    #[msg("Mint does not have the Pausable extension")]
    MintNotPausable,

    #[msg("Transfer hook is not enabled")]
    TransferHookNotEnabled,

    #[msg("Permanent delegate is not enabled")]
    PermanentDelegateNotEnabled,

    #[msg("Amount must be greater than zero")]
    InvalidAmount,

    #[msg("Operation not allowed")]
    OperationNotAllowed,

    #[msg("Blacklist reason must be at most 100 characters")]
    InvalidReasonLength,
}
