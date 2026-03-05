use anchor_lang::prelude::*;

#[account]
pub struct BlacklistEntry {
    pub config: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub blacklisted_at: i64,
    pub blacklisted_by: Pubkey,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const SEED_PREFIX: &'static str = "blacklist";
    pub const MAX_REASON_LEN: usize = 128;
    pub const LEN: usize = 32 + 32 + 4 + Self::MAX_REASON_LEN + 8 + 32 + 1;
}
