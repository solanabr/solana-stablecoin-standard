use anchor_lang::prelude::*;

#[error_code]
pub enum SssPrivateError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Not yet implemented — awaiting stable ZK toolchain")]
    NotYetImplemented,
    #[msg("Account not approved for confidential transfers")]
    AccountNotApproved,
}
