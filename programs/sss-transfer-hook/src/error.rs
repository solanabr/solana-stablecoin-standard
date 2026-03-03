use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Unauthorized: caller is not the hook config authority")]
    Unauthorized,
    #[msg("Sender is blacklisted")]
    SenderBlacklisted,
    #[msg("Receiver is blacklisted")]
    ReceiverBlacklisted,
    #[msg("Wallet is already blacklisted")]
    AlreadyBlacklisted,
    #[msg("Wallet is not blacklisted")]
    NotBlacklisted,
}
