use anchor_lang::prelude::*;

#[error_code]
pub enum TransferHookError {
  #[msg("Sender is blacklisted")]
  SenderBlacklisted,
  #[msg("Receiver is blacklisted")]
  ReceiverBlacklisted,
  #[msg("Reason exceeds maximum length")]
  ReasonTooLong,
  #[msg("Unauthorized: not an admin")]
  Unauthorized,
}
