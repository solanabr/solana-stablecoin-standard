use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Contract is paused")]
    ContractPaused,
    #[msg("Feature not enabled for this stablecoin preset")]
    FeatureNotEnabled, // <-- ДОБАВИЛИ ЭТО
}