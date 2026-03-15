use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum StablecoinPreset {
    SSS1,   // Minimal: metadata + mint/freeze authority
    SSS2,   // Compliant: + permanent delegate, transfer hook, blacklist
    SSS3,   // Private: + confidential transfers (bonus)
    Custom, // User-defined feature flags
}

#[account]
pub struct StablecoinConfig {
    pub bump: u8,
    pub mint: Pubkey,
    pub master_authority: Pubkey,
    pub pending_authority: Pubkey, // Pubkey::default() if none nominated

    // Token metadata
    pub name: String,   // max 32
    pub symbol: String, // max 10
    pub uri: String,    // max 200
    pub decimals: u8,

    // Feature flags (set at init, immutable)
    pub preset: StablecoinPreset,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub enable_confidential_transfers: bool, // SSS-3

    // Operational state
    pub is_paused: bool,
    pub supply_cap: u64, // 0 = unlimited
    pub total_minted: u64,
    pub total_burned: u64,
    pub total_seized: u64,
    pub audit_log_index: u64,
    pub reserve_attestation_index: u64,

    // Timestamps
    pub created_at: i64,
    pub updated_at: i64,
}

impl StablecoinConfig {
    pub const MAX_NAME_LEN: usize = 32;
    pub const MAX_SYMBOL_LEN: usize = 10;
    pub const MAX_URI_LEN: usize = 200;

    pub const SEED_PREFIX: &'static [u8] = b"config";

    // 8 (discriminator) + 1 + 32 + 32 + 32 + (4 + 32) + (4 + 10) + (4 + 200)
    // + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8
    pub const SPACE: usize = 8
        + 1
        + 32
        + 32
        + 32
        + (4 + 32)
        + (4 + 10)
        + (4 + 200)
        + 1
        + 1
        + 1
        + 1
        + 1
        + 1
        + 1
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8;

    pub fn current_supply(&self) -> u64 {
        self.total_minted.saturating_sub(self.total_burned)
    }
}
