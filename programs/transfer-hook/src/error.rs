use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Transfer rejected: source account owner is blacklisted")]
    SourceBlacklisted, // 6000

    #[msg("Transfer rejected: destination account owner is blacklisted")]
    DestinationBlacklisted, // 6001

    #[msg("Invalid extra account meta list")]
    InvalidExtraAccountMetaList, // 6002
}
