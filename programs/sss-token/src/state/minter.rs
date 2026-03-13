use anchor_lang::prelude::*;

#[account]
pub struct MinterInfo {
    pub bump: u8,
    pub config: Pubkey,
    pub minter: Pubkey,
    pub is_active: bool,
    pub mint_quota: u64,   // Max allowed mint (0 = unlimited)
    pub total_minted: u64, // Running total for this minter
    pub created_at: i64,
    pub last_mint_at: i64,
}

impl MinterInfo {
    pub const SEED_PREFIX: &'static [u8] = b"minter";

    // 8 (discriminator) + 1 + 32 + 32 + 1 + 8 + 8 + 8 + 8
    pub const SPACE: usize = 8 + 1 + 32 + 32 + 1 + 8 + 8 + 8 + 8;

    pub fn remaining_quota(&self) -> Option<u64> {
        if self.mint_quota == 0 {
            None // unlimited
        } else {
            Some(self.mint_quota.saturating_sub(self.total_minted))
        }
    }

    pub fn can_mint(&self, amount: u64) -> bool {
        if !self.is_active {
            return false;
        }
        match self.remaining_quota() {
            None => true, // unlimited
            Some(remaining) => amount <= remaining,
        }
    }
}
