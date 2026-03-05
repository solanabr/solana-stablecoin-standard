use anchor_lang::prelude::*;

#[account]
pub struct StablecoinConfig {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub enable_privacy: bool,
    pub proposed_authority: Option<Pubkey>,
    pub bump: u8,
}

impl StablecoinConfig {
    pub const SEED_PREFIX: &'static str = "stablecoin";
    pub const MAX_NAME_LEN: usize = 32;
    pub const MAX_SYMBOL_LEN: usize = 10;
    pub const LEN: usize = 32
        + 32
        + 4
        + Self::MAX_NAME_LEN
        + 4
        + Self::MAX_SYMBOL_LEN
        + 1
        + 1
        + 8
        + 8
        + 1
        + 1
        + 1
        + 1
        + 1
        + 1
        + 32
        + 1;
}
