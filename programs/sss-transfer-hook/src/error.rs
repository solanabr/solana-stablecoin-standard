use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Sender is on the blacklist")]
    SenderBlacklisted,

    #[msg("Recipient is on the blacklist")]
    RecipientBlacklisted,

    #[msg("Transfer hook invoked outside of a transfer — possible exploit attempt")]
    NotTransferring,
}
