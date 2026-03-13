use anchor_lang::prelude::*;
use anchor_lang::prelude::borsh;

// PDA Seed: b"config", mint.key()
#[account]
pub struct StablecoinConfig {
    pub mint: Pubkey,
    pub master_authority: Pubkey, // Ultimate authority, can reassign roles
    
    // Policy flags (set at initialization, immutable afterwards in this standard)
    pub enable_permanent_delegate: bool, // SSS-2 flag
    pub enable_transfer_hook: bool,      // SSS-2 flag
    pub default_account_frozen: bool,    // SSS-2 flag
    pub enable_confidential_transfers: bool, // SSS-3 (future)
    
    pub is_paused: bool,                 // Global pause state
    pub bump: u8,
}

impl StablecoinConfig {
    pub const LEN: usize = 8 // discriminator
        + 32 // mint
        + 32 // master_authority
        + 1  // enable_permanent_delegate
        + 1  // enable_transfer_hook
        + 1  // default_account_frozen
        + 1  // enable_confidential_transfers
        + 1  // is_paused
        + 1; // bump
}
