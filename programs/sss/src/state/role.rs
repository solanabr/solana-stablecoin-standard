use anchor_lang::prelude::*;

/// OpenZeppelin-style role PDA. If account exists → role granted; if closed → revoked.
/// Seeds: [ROLE_SEED, mint, ROLE_NAME, user]
#[account]
#[derive(InitSpace)]
pub struct RoleAccount {
    pub bump: u8,
}
