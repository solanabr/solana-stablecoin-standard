use anchor_lang::prelude::*;

#[error_code]
pub enum TransferHookError {
    #[msg("Sender is blacklisted")]
    SenderBlacklisted,

    #[msg("Receiver is blacklisted")]
    ReceiverBlacklisted,

    #[msg("Stablecoin is paused — all transfers are blocked")]
    StablecoinPaused,

    #[msg("Invalid config account — cannot verify transfer safety")]
    InvalidConfig,

    #[msg("Invalid extra account metas")]
    InvalidExtraAccountMetas,

    #[msg("Sender is not on the allowlist")]
    SenderNotAllowlisted,

    #[msg("Receiver is not on the allowlist")]
    ReceiverNotAllowlisted,
}
