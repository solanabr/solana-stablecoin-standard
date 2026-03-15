use anchor_lang::prelude::*;

#[account]
pub struct BlacklistEntry {
    pub bump: u8,
    pub config: Pubkey,
    pub blocked_address: Pubkey,
    pub reason: String, // max 128
    pub blacklisted_by: Pubkey,
    pub blacklisted_at: i64,
}

impl BlacklistEntry {
    pub const MAX_REASON_LEN: usize = 128;
    pub const SEED_PREFIX: &'static [u8] = b"blacklist";

    // 8 (discriminator) + 1 + 32 + 32 + (4 + 128) + 32 + 8
    pub const SPACE: usize = 8 + 1 + 32 + 32 + (4 + 128) + 32 + 8;
}
