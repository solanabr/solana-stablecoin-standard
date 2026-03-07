use anchor_lang::prelude::*;

/// Per-user minter state with quota. Program checks minted + amount <= allowance on mint.
/// Seeds: [MINT_MINTER_SEED, mint, user]
#[account]
#[derive(InitSpace)]
pub struct MinterAccount {
    pub bump: u8,
    pub allowance: u64,
    pub minted: u64,
}
