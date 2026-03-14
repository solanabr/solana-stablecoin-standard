use anchor_lang::prelude::*;

#[error_code]
pub enum ComplianceError {
    #[msg("Address is blacklisted")]
    Blacklisted,

    #[msg("Insufficient role for this operation")]
    InsufficientRole,

    #[msg("Quota exceeded")]
    QuotaExceeded,

    #[msg("Compliance features not enabled")]
    ComplianceNotEnabled,
}
