use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
pub struct BlacklistEntry {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub blacklisted_at: i64,
    pub reason: String,
    pub blacklisted_by: Pubkey,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const MAX_REASON_LEN: usize = 128;

    pub fn space(reason: &str) -> usize {
        8 + // discriminator
        32 + // mint
        32 + // wallet
        8 + // blacklisted_at
        4 + reason.len() + // reason (string)
        32 + // blacklisted_by
        1 // bump
    }
}
