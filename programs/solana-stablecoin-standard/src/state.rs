use anchor_lang::prelude::*;

/// Preset type for the stablecoin
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum Preset {
    /// SSS-1: Minimal stablecoin (mint + freeze + metadata)
    Sss1,
    /// SSS-2: Compliant stablecoin (SSS-1 + permanent delegate + transfer hook + blacklist)
    Sss2,
    /// SSS-3: Private stablecoin (SSS-2 + confidential transfers)
    Sss3,
    /// Custom configuration
    Custom,
}

/// Top-level stablecoin configuration PDA
/// Seeds: [b"stablecoin-config", mint.key().as_ref()]
#[account]
#[derive(Debug)]
pub struct StablecoinConfig {
    /// The Token-2022 mint address
    pub mint: Pubkey,
    /// Preset type
    pub preset: Preset,
    /// Whether transfers are globally paused
    pub paused: bool,
    /// Maximum supply (0 = unlimited)
    pub max_supply: u64,
    /// Current decimals
    pub decimals: u8,
    /// Whether permanent delegate is enabled (SSS-2)
    pub permanent_delegate_enabled: bool,
    /// Whether transfer hook is enabled (SSS-2+)
    pub transfer_hook_enabled: bool,
    /// Whether confidential transfers are enabled (SSS-3)
    pub confidential_transfers_enabled: bool,
    /// Whether an oracle price feed is configured
    pub oracle_enabled: bool,
    /// Bump seed
    pub bump: u8,
}

impl StablecoinConfig {
    pub const LEN: usize = 8 + 32 + 1 + 1 + 1 + 8 + 1 + 1 + 1 + 1 + 1 + 1;
}

/// Role-based access control configuration
/// Seeds: [b"roles-config", mint.key().as_ref()]
#[account]
#[derive(Debug)]
pub struct RolesConfig {
    /// The mint this roles config belongs to
    pub mint: Pubkey,
    /// Master authority — can do everything including transfer authority
    pub master_authority: Pubkey,
    /// Minter address (single minter; extend to vec for multi-minter)
    pub minter: Pubkey,
    /// Optional per-minter quota (0 = unlimited)
    pub minter_quota: u64,
    /// Minted in current epoch (for quota tracking)
    pub minted_this_epoch: u64,
    /// Burner address
    pub burner: Pubkey,
    /// Blacklister address (SSS-2 only, set to Pubkey::default() for SSS-1)
    pub blacklister: Pubkey,
    /// Pauser address
    pub pauser: Pubkey,
    /// Seizer address (SSS-2 only, set to Pubkey::default() for SSS-1)
    pub seizer: Pubkey,
    /// Bump seed
    pub bump: u8,
}

impl RolesConfig {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 8 + 32 + 32 + 32 + 32 + 1;
}

/// Blacklist entry PDA (SSS-2 only)
/// Seeds: [b"blacklist", mint.key().as_ref(), address.as_ref()]
#[account]
#[derive(Debug)]
pub struct BlacklistEntry {
    /// The mint this entry belongs to
    pub mint: Pubkey,
    /// The blacklisted address
    pub address: Pubkey,
    /// When this entry was added (Unix timestamp)
    pub added_at: i64,
    /// Who added this entry
    pub added_by: Pubkey,
    /// Reason code (0 = unspecified)
    pub reason: u8,
    /// Bump seed
    pub bump: u8,
}

impl BlacklistEntry {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 32 + 1 + 1;
}

/// Audit log entry for compliance tracking
/// Seeds: [b"audit", mint.key().as_ref(), &index.to_le_bytes()]
#[account]
#[derive(Debug)]
pub struct AuditLogEntry {
    pub mint: Pubkey,
    pub action: AuditAction,
    pub actor: Pubkey,
    pub target: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub bump: u8,
}

impl AuditLogEntry {
    pub const LEN: usize = 8 + 32 + 1 + 32 + 32 + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum AuditAction {
    Mint,
    Burn,
    Freeze,
    Thaw,
    Pause,
    Unpause,
    Blacklist,
    Unblacklist,
    Seize,
    UpdateRoles,
    TransferAuthority,
    OracleConfigured,
}

/// Oracle configuration for non-USD peg support
/// Seeds: [b"oracle-config", mint.key().as_ref()]
#[account]
#[derive(Debug)]
pub struct OracleConfig {
    /// The mint this oracle config belongs to
    pub mint: Pubkey,
    /// The oracle price feed account (Pyth, Switchboard, or custom)
    pub price_feed: Pubkey,
    /// Peg currency code (e.g. "EUR", "XAU", "BRL") — padded to 8 bytes
    pub peg_currency: [u8; 8],
    /// Maximum staleness in seconds before oracle data is rejected
    pub max_staleness_secs: i64,
    /// Price exponent (e.g. -8 means price is in units of 10^-8)
    pub price_exponent: i32,
    /// Whether oracle checking is enabled
    pub enabled: bool,
    /// Who configured the oracle
    pub configured_by: Pubkey,
    /// When the oracle was last configured
    pub configured_at: i64,
    /// Bump seed
    pub bump: u8,
}

impl OracleConfig {
    // 8 discriminator + 32 mint + 32 feed + 8 currency + 8 staleness + 4 exponent + 1 enabled + 32 configured_by + 8 configured_at + 1 bump
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 4 + 1 + 32 + 8 + 1;
}
