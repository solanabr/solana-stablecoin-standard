use anchor_lang::prelude::*;

/// Input parameters for initializing a stablecoin
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StablecoinConfigInput {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    /// Enable SSS-2 compliance features (permanent delegate, transfer hook, default frozen)
    pub compliance_enabled: bool,
    /// Enable SSS-3 allowlist mode (requires compliance_enabled)
    pub enable_allowlist: bool,
    /// Optional supply cap (0 = unlimited)
    pub supply_cap: Option<u64>,
}

/// Core configuration account for a stablecoin mint.
/// Seeds: [b"config", mint.key()]
#[account]
pub struct StablecoinConfig {
    /// Authority who can manage roles and admin operations
    pub authority: Pubkey,          // 32
    /// Pending authority for two-step transfer (zero = none pending)
    pub pending_authority: Pubkey,  // 32
    /// The Token-2022 mint this config governs
    pub mint: Pubkey,               // 32
    /// Transfer hook program ID (zero if SSS-1)
    pub transfer_hook_program: Pubkey, // 32
    /// Whether the stablecoin is paused (no minting/burning/transfers)
    pub paused: bool,               // 1
    /// Whether SSS-2 compliance features are enabled
    pub compliance_enabled: bool,   // 1
    /// Total amount ever minted
    pub total_minted: u64,          // 8
    /// Total amount ever burned
    pub total_burned: u64,          // 8
    /// Maximum supply cap (0 = unlimited)
    pub supply_cap: u64,            // 8
    /// Whether SSS-3 allowlist mode is enabled
    pub enable_allowlist: bool,     // 1
    /// PDA bump
    pub bump: u8,                   // 1
    /// Reserved for future upgrades
    pub _reserved: [u8; 23],        // 23
}

impl StablecoinConfig {
    pub const LEN: usize = 8   // discriminator
        + 32    // authority
        + 32    // pending_authority
        + 32    // mint
        + 32    // transfer_hook_program
        + 1     // paused
        + 1     // compliance_enabled
        + 8     // total_minted
        + 8     // total_burned
        + 8     // supply_cap
        + 1     // enable_allowlist
        + 1     // bump
        + 23;   // _reserved
    // Total: 8 + 32 + 32 + 32 + 32 + 1 + 1 + 8 + 8 + 8 + 1 + 1 + 23 = 187

    /// Returns current circulating supply (minted - burned)
    pub fn current_supply(&self) -> u64 {
        self.total_minted.saturating_sub(self.total_burned)
    }
}

/// Role assignment PDA.
/// Seeds: [b"role", config.key(), role_byte, holder.key()]
#[account]
pub struct RoleAssignment {
    /// The config this role is associated with
    pub config: Pubkey,             // 32
    /// The holder of this role
    pub holder: Pubkey,             // 32
    /// The role type (see constants.rs ROLE_*)
    pub role: u8,                   // 1
    /// Whether this role is currently active
    pub active: bool,               // 1
    /// Who granted this role
    pub granted_by: Pubkey,         // 32
    /// When this role was granted (unix timestamp)
    pub granted_at: i64,            // 8
    /// PDA bump
    pub bump: u8,                   // 1
    /// Reserved for future upgrades
    pub _reserved: [u8; 16],        // 16
}

impl RoleAssignment {
    pub const LEN: usize = 8   // discriminator
        + 32    // config
        + 32    // holder
        + 1     // role
        + 1     // active
        + 32    // granted_by
        + 8     // granted_at
        + 1     // bump
        + 16;   // _reserved
    // Total: 8 + 32 + 32 + 1 + 1 + 32 + 8 + 1 + 16 = 131
}

/// Minter quota tracking PDA.
/// Seeds: [b"quota", config.key(), minter.key()]
#[account]
pub struct MinterQuota {
    /// The config this quota is associated with
    pub config: Pubkey,             // 32
    /// The minter this quota applies to
    pub minter: Pubkey,             // 32
    /// Maximum amount this minter can mint (u64::MAX = unlimited)
    pub quota_limit: u64,           // 8
    /// Amount already minted by this minter
    pub minted_amount: u64,         // 8
    /// PDA bump
    pub bump: u8,                   // 1
    /// Reserved for future upgrades
    pub _reserved: [u8; 32],        // 32
}

impl MinterQuota {
    pub const LEN: usize = 8   // discriminator
        + 32    // config
        + 32    // minter
        + 8     // quota_limit
        + 8     // minted_amount
        + 1     // bump
        + 32;   // _reserved
}

/// Blacklist entry PDA (SSS-2 only).
/// Seeds: [b"blacklist", config.key(), address.key()]
/// Entries are deactivated (active=false) rather than deleted for audit trail.
#[account]
pub struct BlacklistEntry {
    /// The config this blacklist entry is associated with
    pub config: Pubkey,             // 32
    /// The blacklisted address
    pub address: Pubkey,            // 32
    /// Reason for blacklisting
    pub reason: String,             // 4 + up to 128
    /// When the address was blacklisted (unix timestamp)
    pub blacklisted_at: i64,        // 8
    /// Who blacklisted this address
    pub blacklisted_by: Pubkey,     // 32
    /// Whether this blacklist entry is currently active
    pub active: bool,               // 1
    /// PDA bump
    pub bump: u8,                   // 1
    /// Reserved for future upgrades
    pub _reserved: [u8; 16],        // 16
}

impl BlacklistEntry {
    pub const LEN: usize = 8   // discriminator
        + 32    // config
        + 32    // address
        + (4 + 128) // reason (String: 4 byte len + max 128 chars)
        + 8     // blacklisted_at
        + 32    // blacklisted_by
        + 1     // active
        + 1     // bump
        + 16;   // _reserved
    // Total: 8 + 32 + 32 + 132 + 8 + 32 + 1 + 1 + 16 = 262
}

/// Allowlist entry PDA (SSS-3 only).
/// Seeds: [b"allowlist", config.key(), address.key()]
/// Unlike blacklist entries, allowlist entries are closed on removal.
#[account]
pub struct AllowlistEntry {
    /// The config this allowlist entry is associated with
    pub config: Pubkey,             // 32
    /// The allowlisted address
    pub address: Pubkey,            // 32
    /// When the address was added (unix timestamp)
    pub added_at: i64,              // 8
    /// Who added this address
    pub added_by: Pubkey,           // 32
    /// PDA bump
    pub bump: u8,                   // 1
}

impl AllowlistEntry {
    pub const LEN: usize = 8   // discriminator
        + 32    // config
        + 32    // address
        + 8     // added_at
        + 32    // added_by
        + 1;    // bump
    // Total: 8 + 32 + 32 + 8 + 32 + 1 = 113
}

/// Oracle configuration PDA.
/// Seeds: [b"oracle", config.key()]
#[account]
pub struct OracleConfig {
    /// The config this oracle is associated with
    pub config: Pubkey,             // 32
    /// The price feed account (e.g. Pyth)
    pub price_feed: Pubkey,         // 32
    /// Maximum allowed deviation from $1.00 in basis points (e.g. 100 = 1%)
    pub max_deviation_bps: u16,     // 2
    /// Maximum staleness in seconds before price is considered stale
    pub max_staleness_secs: u64,    // 8
    /// Whether oracle validation is enabled
    pub enabled: bool,              // 1
    /// PDA bump
    pub bump: u8,                   // 1
}

impl OracleConfig {
    pub const LEN: usize = 8   // discriminator
        + 32    // config
        + 32    // price_feed
        + 2     // max_deviation_bps
        + 8     // max_staleness_secs
        + 1     // enabled
        + 1;    // bump
    // Total: 8 + 32 + 32 + 2 + 8 + 1 + 1 = 84
}
