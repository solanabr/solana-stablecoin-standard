use anchor_lang::prelude::*;

use crate::constants::*;

#[account]
pub struct StablecoinConfig {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub enable_default_frozen: bool,
    pub paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

impl StablecoinConfig {
    pub const LEN: usize = 8
        + 32
        + 32
        + (4 + MAX_NAME_LEN)
        + (4 + MAX_SYMBOL_LEN)
        + (4 + MAX_URI_LEN)
        + 1
        + 1
        + 1
        + 1
        + 1
        + 8
        + 8
        + 1
        + 64;

    pub const SEED_PREFIX: &'static [u8] = STABLECOIN_SEED;
}

#[account]
pub struct RoleManager {
    pub stablecoin: Pubkey,
    pub minters: Vec<Pubkey>,
    pub burners: Vec<Pubkey>,
    pub pausers: Vec<Pubkey>,
    pub blacklisters: Vec<Pubkey>,
    pub seizers: Vec<Pubkey>,
    pub bump: u8,
    pub _reserved: [u8; 32],
}

impl RoleManager {
    pub const LEN: usize = 8
        + 32
        + (4 + 32 * MAX_MINTERS)
        + (4 + 32 * MAX_BURNERS)
        + (4 + 32 * MAX_PAUSERS)
        + (4 + 32 * MAX_BLACKLISTERS)
        + (4 + 32 * MAX_SEIZERS)
        + 1
        + 32;

    pub const SEED_PREFIX: &'static [u8] = ROLES_SEED;
}

#[account]
pub struct MinterInfo {
    pub minter: Pubkey,
    pub stablecoin: Pubkey,
    pub quota: u64,
    pub minted: u64,
    pub bump: u8,
}

impl MinterInfo {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1;

    pub const SEED_PREFIX: &'static [u8] = MINTER_SEED;
}

#[account]
pub struct BlacklistEntry {
    pub address: Pubkey,
    pub stablecoin: Pubkey,
    pub reason: String,
    pub blacklisted_at: i64,
    pub blacklisted_by: Pubkey,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const LEN: usize = 8
        + 32
        + 32
        + (4 + MAX_REASON_LEN)
        + 8
        + 32
        + 1;

    pub const SEED_PREFIX: &'static [u8] = BLACKLIST_SEED;
}
