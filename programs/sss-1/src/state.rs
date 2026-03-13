use anchor_lang::prelude::*;

use crate::constants::{BLACKLIST_SEED, CONFIG_SEED, HOOK_CONFIG_SEED, ROLE_SEED};

#[account]
pub struct StablecoinConfig {
    /// Admin authority who can manage roles and update metadata
    pub admin: Pubkey,
    /// Token-2022 mint address
    pub mint: Pubkey,
    /// Mint decimals
    pub decimals: u8,
    /// Whether role-based access control is enabled
    pub roles_enabled: bool,
    /// Whether freeze functionality is enabled
    pub freeze_enabled: bool,
    /// Emergency pause switch for state-changing operations
    pub paused: bool,
    /// Token name (stored for reference)
    pub name: String,
    /// Token symbol (stored for reference)
    pub symbol: String,
    /// Token URI (stored for reference)
    pub uri: String,
    /// PDA bump
    pub bump: u8,
    /// Reserved for future upgrades
    pub _reserved: [u8; 64],
}

impl StablecoinConfig {
    pub const MAX_NAME_LEN: usize = 32;
    pub const MAX_SYMBOL_LEN: usize = 10;
    pub const MAX_URI_LEN: usize = 200;

    pub const LEN: usize = 8 + // discriminator
        32 + // admin
        32 + // mint
        1 +  // decimals
        1 +  // roles_enabled
        1 +  // freeze_enabled
        1 +  // paused
        (4 + Self::MAX_NAME_LEN) +   // name (string prefix + max)
        (4 + Self::MAX_SYMBOL_LEN) +  // symbol (string prefix + max)
        (4 + Self::MAX_URI_LEN) +     // uri (string prefix + max)
        1 +  // bump
        64; // _reserved

    pub const SEED_PREFIX: &'static [u8] = CONFIG_SEED;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum RoleType {
    Admin = 0,
    Minter = 1,
    Burner = 2,
    Freezer = 3,
    Blacklister = 4,
}

impl RoleType {
    pub fn to_seed(&self) -> [u8; 1] {
        [*self as u8]
    }
}

#[account]
pub struct Role {
    /// The type of role
    pub role_type: u8,
    /// The config this role belongs to
    pub config: Pubkey,
    /// The authority this role is granted to
    pub authority: Pubkey,
    /// Who granted this role
    pub granted_by: Pubkey,
    /// When this role was granted (Unix timestamp)
    pub granted_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl Role {
    pub const LEN: usize = 8 + // discriminator
        1 +  // role_type
        32 + // config
        32 + // authority
        32 + // granted_by
        8 +  // granted_at
        1; // bump

    pub const SEED_PREFIX: &'static [u8] = ROLE_SEED;
}

#[account]
pub struct HookConfig {
    /// Authority who can manage the blacklist module.
    pub authority: Pubkey,
    /// The mint this hook module is associated with.
    pub mint: Pubkey,
    /// Whether compliance checks are active in transfer_hook.
    pub compliance_enabled: bool,
    /// PDA bump.
    pub bump: u8,
    /// Reserved for future upgrades.
    pub _reserved: [u8; 64],
}

impl HookConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // mint
        1 +  // compliance_enabled
        1 +  // bump
        64; // _reserved

    pub const SEED_PREFIX: &'static [u8] = HOOK_CONFIG_SEED;
}

#[account]
pub struct Blacklist {
    /// The hook config this entry belongs to.
    pub hook_config: Pubkey,
    /// The blacklisted address.
    pub address: Pubkey,
    /// PDA bump.
    pub bump: u8,
}

impl Blacklist {
    pub const LEN: usize = 8 + // discriminator
        32 + // hook_config
        32 + // address
        1; // bump

    pub const SEED_PREFIX: &'static [u8] = BLACKLIST_SEED;
}
