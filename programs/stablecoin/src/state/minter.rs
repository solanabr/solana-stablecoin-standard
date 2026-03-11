use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
pub struct MinterAllowance {
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub allowance: u64,
    pub total_minted: u64,
    pub is_active: bool,
    pub bump: u8,
}

impl MinterAllowance {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}
