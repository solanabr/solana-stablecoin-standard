use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Transfer rejected: sender is blacklisted")]
    SenderBlacklisted, // 6000
    #[msg("Transfer rejected: recipient is blacklisted")]
    RecipientBlacklisted, // 6001
    #[msg("Transfer rejected: token operations are paused")]
    Paused, // 6002
    #[msg("Blacklist account key does not match expected PDA")]
    InvalidBlacklistAccount, // 6003
}
