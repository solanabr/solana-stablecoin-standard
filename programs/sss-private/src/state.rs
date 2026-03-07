use anchor_lang::prelude::*;

#[account]
pub struct PrivateStablecoinConfig {
    pub authority: Pubkey,       // 32
    pub mint: Pubkey,            // 32
    pub auditor_elgamal_pubkey: [u8; 32], // 32 — ElGamal pubkey for auditor
    pub allowlister: Option<Pubkey>, // 33
    pub bump: u8,                // 1
}

impl PrivateStablecoinConfig {
    pub const LEN: usize = 32 + 32 + 32 + 33 + 1;
}

#[account]
pub struct AllowlistEntry {
    pub token_account: Pubkey, // 32
    pub approved_at: i64,      // 8
    pub bump: u8,              // 1
}

impl AllowlistEntry {
    pub const LEN: usize = 32 + 8 + 1;
}
