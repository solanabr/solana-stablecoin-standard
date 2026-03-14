use anchor_lang::prelude::*;

#[error_code]
pub enum PrivacyError {
    #[msg("Address not on allowlist")]
    NotAllowed,

    #[msg("Confidential transfers not enabled")]
    ConfidentialTransfersNotEnabled,

    #[msg("Privacy features not supported for this preset")]
    PrivacyNotSupported,
}
