use anchor_lang::prelude::*;

#[account]
pub struct AllowlistEntry {
    pub bump: u8,
    pub config: Pubkey,
    pub address: Pubkey,
    pub added_by: Pubkey,
    pub added_at: i64,
    pub reason: String, // max 64
}

impl AllowlistEntry {
    pub const MAX_REASON_LEN: usize = 64;
    pub const SEED_PREFIX: &'static [u8] = b"allowlist";

    // 8 (discriminator) + 1 + 32 + 32 + 32 + 8 + (4 + 64)
    pub const SPACE: usize = 8 + 1 + 32 + 32 + 32 + 8 + (4 + 64);
}
