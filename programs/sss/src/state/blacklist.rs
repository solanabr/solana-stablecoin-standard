use anchor_lang::prelude::*;
use anchor_lang::prelude::borsh;

// PDA Seed: b"blacklist", config.key(), account.key()
#[account]
pub struct BlacklistRegistry {
    pub config: Pubkey,
    pub account: Pubkey,
    pub reason: String, // audit trail for the enforcement
    pub bump: u8,
}

impl BlacklistRegistry {
    // 32 chars max for reason string
    pub const LEN: usize = 8 // discriminator
        + 32 // config
        + 32 // account
        + 4 + 32  // reason length prefix + max 32 chars string
        + 1; // bump
}
