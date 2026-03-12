use anchor_lang::prelude::*;
use crate::constants::MAX_REASON_LEN;

/// PDA entry for a blacklisted address. Seeds: ["blacklist", mint, address].
#[account]
pub struct BlacklistEntry {
    pub mint: Pubkey,
    /// The address that is blacklisted.
    pub address: Pubkey,
    pub blacklisted_by: Pubkey,
    pub reason: String,
    pub timestamp: i64,
    pub bump: u8,
}

impl BlacklistEntry {
    pub fn space(reason: &str) -> usize {
        8   // discriminator
        + 32 // mint
        + 32 // address
        + 32 // blacklisted_by
        + 4 + reason.len().min(MAX_REASON_LEN)
        + 8  // timestamp
        + 1  // bump
    }
}
