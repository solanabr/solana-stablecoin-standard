use anchor_lang::prelude::*;

/// Per-user minter state with quota. Program checks minted + amount <= allowance on mint.
/// Seeds: [ROLE_SEED, mint, MINTER_ROLE, user]
#[account]
#[derive(InitSpace)]
pub struct MinterAccount {
    pub bump: u8,
    pub allowance: u64,
    pub minted: u64,
    /// Mint this minter account is for. Enables RPC filtering by mint when listing minters.
    pub mint: Pubkey,
}
