use anchor_lang::prelude::*;

#[error_code]
pub enum TransferHookError {
    #[msg("Wallet is in blacklist")]
    WalletBlacklisted,
    #[msg("Unauthorized")]
    Unauthorized,
}