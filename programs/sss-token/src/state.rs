use anchor_lang::prelude::*;
use crate::constants::*;

/// Global configuration PDA for a deployed stablecoin.
/// Seeds: ["config", mint]
#[account]
pub struct StablecoinConfig {
    /// Master authority — can execute any instruction
    pub authority: Pubkey,
    /// The Token-2022 mint this config governs
    pub mint: Pubkey,
    /// Human-readable name (e.g. "My Stablecoin")
    pub name: String,
    /// Ticker symbol (e.g. "MYUSD")
    pub symbol: String,
    /// Metadata URI
    pub uri: String,
    /// Token decimals
    pub decimals: u8,
    /// Whether the contract is globally paused (no mint/burn/freeze)
    pub paused: bool,
    /// Preset identifier: PRESET_SSS1 | PRESET_SSS2
    pub preset: u8,
    /// Whether PermanentDelegate extension is enabled (SSS-2)
    pub enable_permanent_delegate: bool,
    /// Whether TransferHook extension is enabled (SSS-2)
    pub enable_transfer_hook: bool,
    /// Whether new token accounts are frozen by default
    pub default_account_frozen: bool,
    /// Address allowed to burn tokens (None = only authority)
    pub burner: Option<Pubkey>,
    /// Address allowed to pause/unpause (None = only authority)
    pub pauser: Option<Pubkey>,
    /// Address allowed to manage blacklist (SSS-2 only)
    pub blacklister: Option<Pubkey>,
    /// Address allowed to seize tokens (SSS-2 only)
    pub seizer: Option<Pubkey>,
    /// PDA bump
    pub bump: u8,
}

impl StablecoinConfig {
    /// Space: discriminator(8) + authority(32) + mint(32) + name(4+32) + symbol(4+10)
    ///       + uri(4+200) + decimals(1) + paused(1) + preset(1)
    ///       + enable_permanent_delegate(1) + enable_transfer_hook(1) + default_account_frozen(1)
    ///       + burner(1+32) + pauser(1+32) + blacklister(1+32) + seizer(1+32) + bump(1)
    pub const SPACE: usize = 8
        + 32 + 32
        + (4 + MAX_NAME_LEN)
        + (4 + MAX_SYMBOL_LEN)
        + (4 + MAX_URI_LEN)
        + 1 + 1 + 1 + 1 + 1 + 1
        + (1 + 32) + (1 + 32) + (1 + 32) + (1 + 32)
        + 1;

    /// Check if a given key has pause authority
    pub fn has_pause_authority(&self, key: &Pubkey) -> bool {
        *key == self.authority || self.pauser == Some(*key)
    }

    /// Check if a given key has burn authority
    pub fn has_burn_authority(&self, key: &Pubkey) -> bool {
        *key == self.authority || self.burner == Some(*key)
    }

    /// Check if a given key has blacklist authority (SSS-2)
    pub fn has_blacklist_authority(&self, key: &Pubkey) -> bool {
        *key == self.authority || self.blacklister == Some(*key)
    }

    /// Check if a given key has seize authority (SSS-2)
    pub fn has_seize_authority(&self, key: &Pubkey) -> bool {
        *key == self.authority || self.seizer == Some(*key)
    }
}

/// Per-minter quota tracking.
/// Seeds: ["minter", mint, minter_pubkey]
#[account]
pub struct MinterInfo {
    pub mint: Pubkey,
    pub minter: Pubkey,
    /// Max tokens this minter can mint (0 = unlimited)
    pub quota: u64,
    /// Tokens minted so far (lifetime, not per-period)
    pub minted: u64,
    pub active: bool,
    pub bump: u8,
}

impl MinterInfo {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

/// Blacklist entry for SSS-2 compliance.
/// Seeds: ["blacklist", mint, address]
/// Existence of this account = address is blacklisted.
#[account]
pub struct BlacklistEntry {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub timestamp: i64,
    pub blacklister: Pubkey,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const SPACE: usize = 8 + 32 + 32 + (4 + MAX_REASON_LEN) + 8 + 32 + 1;
}
