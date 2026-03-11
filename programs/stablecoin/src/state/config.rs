use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum StablecoinPreset {
    SSS1,
    SSS2,
    SSS3,
    Custom,
}

#[account]
#[derive(Debug)]
pub struct StablecoinConfig {
    pub mint: Pubkey,
    pub preset: StablecoinPreset,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,

    // Authorities
    pub owner: Pubkey,
    pub pending_owner: Option<Pubkey>,
    pub master_minter: Pubkey,
    pub pauser: Pubkey,
    pub blacklister: Pubkey,

    // State
    pub is_paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,

    // Feature flags (set at init, immutable)
    pub enable_transfer_hook: bool,
    pub enable_permanent_delegate: bool,
    pub enable_confidential_transfers: bool,
    pub default_account_frozen: bool,

    // SSS-3 specific
    pub auditor_elgamal_pubkey: Option<[u8; 32]>,

    pub bump: u8,
}

impl StablecoinConfig {
    pub const MAX_NAME_LEN: usize = 32;
    pub const MAX_SYMBOL_LEN: usize = 10;
    pub const MAX_URI_LEN: usize = 200;

    pub fn space(name: &str, symbol: &str, uri: &str) -> usize {
        8 + // discriminator
        32 + // mint
        1 + // preset enum
        4 + name.len() + // name (string)
        4 + symbol.len() + // symbol (string)
        4 + uri.len() + // uri (string)
        1 + // decimals
        32 + // owner
        1 + 32 + // pending_owner (Option<Pubkey>)
        32 + // master_minter
        32 + // pauser
        32 + // blacklister
        1 + // is_paused
        8 + // total_minted
        8 + // total_burned
        1 + // enable_transfer_hook
        1 + // enable_permanent_delegate
        1 + // enable_confidential_transfers
        1 + // default_account_frozen
        1 + 32 + // auditor_elgamal_pubkey (Option<[u8; 32]>)
        1 // bump
    }
}
