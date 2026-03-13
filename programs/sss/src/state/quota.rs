use anchor_lang::prelude::*;
use anchor_lang::prelude::borsh;

// PDA Seed: b"quota", config.key(), minter.key()
#[account]
pub struct MinterQuota {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub limit: u64,
    pub minted_amount: u64,
    pub bump: u8,
}

impl MinterQuota {
    pub const LEN: usize = 8 // discriminator
        + 32 // config
        + 32 // minter
        + 8  // limit
        + 8  // minted_amount
        + 1; // bump
}
