use anchor_lang::prelude::*;
use crate::constants::*;

/// Core stablecoin configuration account.
/// Stores all settings including which SSS features are enabled.
/// Seeds: ["stablecoin", mint_pubkey]
#[account]
pub struct StablecoinConfig {
    /// Master authority (can update roles, transfer authority)
    pub authority: Pubkey,
    /// Pending authority for two-step transfer (nominate → accept)
    pub pending_authority: Option<Pubkey>,
    /// The Token-2022 mint
    pub mint: Pubkey,
    /// Human-readable name
    pub name: String,
    /// Ticker symbol
    pub symbol: String,
    /// Metadata URI
    pub uri: String,
    /// Token decimals
    pub decimals: u8,
    /// SSS-2: permanent delegate enabled (token seizure)
    pub enable_permanent_delegate: bool,
    /// SSS-2: transfer hook enabled (blacklist enforcement)
    pub enable_transfer_hook: bool,
    /// SSS-2: new accounts start frozen by default
    pub default_account_frozen: bool,
    /// Emergency pause flag
    pub paused: bool,
    /// Optional hard supply cap (0 = no cap)
    pub supply_cap: u64,
    /// Total number of tokens ever minted (for audit)
    pub total_minted: u64,
    /// Total number of tokens ever burned (for audit)
    pub total_burned: u64,
    /// PDA bump
    pub bump: u8,
    /// Reserved for future upgrades
    pub _reserved: [u8; 64],
}

impl StablecoinConfig {
    pub const LEN: usize = 8 +     // discriminator
        32 +                        // authority
        (1 + 32) +                  // pending_authority (Option<Pubkey>)
        32 +                        // mint
        (4 + MAX_NAME_LEN) +        // name (String)
        (4 + MAX_SYMBOL_LEN) +      // symbol (String)
        (4 + MAX_URI_LEN) +         // uri (String)
        1 +                         // decimals
        1 +                         // enable_permanent_delegate
        1 +                         // enable_transfer_hook
        1 +                         // default_account_frozen
        1 +                         // paused
        8 +                         // supply_cap
        8 +                         // total_minted
        8 +                         // total_burned
        1 +                         // bump
        64;                         // _reserved

    pub fn is_sss2(&self) -> bool {
        self.enable_permanent_delegate || self.enable_transfer_hook
    }

    pub fn current_supply(&self) -> u64 {
        self.total_minted.saturating_sub(self.total_burned)
    }

    pub fn check_supply_cap(&self, mint_amount: u64) -> bool {
        if self.supply_cap == 0 {
            return true; // No cap
        }
        let new_supply = self.current_supply().saturating_add(mint_amount);
        new_supply <= self.supply_cap
    }
}

/// Role-based access control account with audit fields.
/// Each key can hold multiple roles for a given stablecoin.
/// Seeds: ["roles", stablecoin_config_pubkey, role_holder_pubkey]
#[account]
pub struct RoleAccount {
    /// The stablecoin this role belongs to
    pub stablecoin: Pubkey,
    /// The key that holds these roles
    pub holder: Pubkey,
    /// Bitfield of assigned roles
    pub roles: u16,
    /// Who granted these roles (for audit trail)
    pub granted_by: Pubkey,
    /// When roles were last modified
    pub last_modified: i64,
    /// Whether this role account is active (false = revoked but preserved for audit)
    pub active: bool,
    /// PDA bump
    pub bump: u8,
}

impl RoleAccount {
    pub const LEN: usize = 8 + 32 + 32 + 2 + 32 + 8 + 1 + 1;
}

/// Individual role flags stored as a bitfield in RoleAccount.roles
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Role;

impl Role {
    pub const MINTER: u16 = 1 << 0;
    pub const BURNER: u16 = 1 << 1;
    pub const PAUSER: u16 = 1 << 2;
    pub const BLACKLISTER: u16 = 1 << 3;  // SSS-2 only
    pub const SEIZER: u16 = 1 << 4;       // SSS-2 only
    pub const FREEZER: u16 = 1 << 5;

    pub fn name(flag: u16) -> &'static str {
        match flag {
            1 => "minter",
            2 => "burner",
            4 => "pauser",
            8 => "blacklister",
            16 => "seizer",
            32 => "freezer",
            _ => "unknown",
        }
    }
}

/// Per-minter configuration with quota tracking.
/// Seeds: ["minter", stablecoin_config_pubkey, minter_pubkey]
#[account]
pub struct MinterConfig {
    /// The stablecoin this minter config belongs to
    pub stablecoin: Pubkey,
    /// The minter's public key
    pub minter: Pubkey,
    /// Maximum tokens this minter can have outstanding (0 = unlimited)
    pub quota: u64,
    /// Amount currently minted by this minter
    pub minted: u64,
    /// Whether this minter is active
    pub active: bool,
    /// PDA bump
    pub bump: u8,
}

impl MinterConfig {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

/// Blacklist entry for SSS-2 compliance.
/// Seeds: ["blacklist", stablecoin_config_pubkey, blacklisted_pubkey]
#[account]
pub struct BlacklistEntry {
    /// The stablecoin this entry belongs to
    pub stablecoin: Pubkey,
    /// The blacklisted wallet address
    pub account: Pubkey,
    /// Reason for blacklisting (e.g. "OFAC match")
    pub reason: String,
    /// Who added this entry
    pub added_by: Pubkey,
    /// Timestamp when added
    pub added_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl BlacklistEntry {
    pub const LEN: usize = 8 + 32 + 32 + (4 + MAX_REASON_LEN) + 32 + 8 + 1;
}
