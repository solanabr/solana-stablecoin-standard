use anchor_lang::prelude::*;

#[account]
pub struct BlacklistEntry {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub added_by: Pubkey,
    pub added_at: i64,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const MAX_REASON_LEN: usize = 100;
    pub const LEN: usize = 8 + 32 + 32 + (4 + Self::MAX_REASON_LEN) + 32 + 8 + 1;
}
