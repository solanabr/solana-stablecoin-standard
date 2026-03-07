use anchor_lang::prelude::*;

#[error_code]
pub enum SssHookError {
    #[msg("Transfer blocked: sender is blacklisted")]
    SenderBlacklisted,

    #[msg("Transfer blocked: recipient is blacklisted")]
    RecipientBlacklisted,
}
