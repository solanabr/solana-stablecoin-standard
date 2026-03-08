use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("You are not authorized to perform this action.")]
    Unauthorized,
    #[msg("The stablecoin contract is currently paused.")]
    Paused,
}