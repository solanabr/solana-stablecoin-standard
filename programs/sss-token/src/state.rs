use anchor_lang::prelude::*;

// ─── Global Stablecoin State ──────────────────────────────────────────────────

#[account]
#[derive(Default)]
pub struct StablecoinState {
    /// Master authority — can do everything
    pub master_authority: Pubkey,
    /// Pending authority for two-step transfer
    pub pending_authority: Option<Pubkey>,
    /// Token-2022 mint address
    pub mint: Pubkey,
    /// Human-readable name
    pub name: String,
    /// Ticker symbol
    pub symbol: String,
    /// Metadata URI
    pub uri: String,
    /// Decimal places
    pub decimals: u8,

    // ── SSS-2 feature flags (set at init, immutable after) ──────────────────
    pub compliance_enabled: bool,
    pub permanent_delegate_enabled: bool,
    pub transfer_hook_enabled: bool,
    pub default_account_frozen: bool,

    // ── Operational state ───────────────────────────────────────────────────
    pub paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,

    // ── Roles ───────────────────────────────────────────────────────────────
    pub pauser: Option<Pubkey>,
    pub burner: Option<Pubkey>,
    /// SSS-2 only
    pub blacklister: Option<Pubkey>,
    /// SSS-2 only
    pub seizer: Option<Pubkey>,

    /// Transfer hook program ID (SSS-2)
    pub transfer_hook_program_id: Option<Pubkey>,

    pub bump: u8,
}

impl StablecoinState {
    /// Discriminator (8) + all fields worst-case
    pub const LEN: usize = 8
        + 32  // master_authority
        + 1 + 32  // pending_authority
        + 32  // mint
        + 4 + 64  // name
        + 4 + 16  // symbol
        + 4 + 200 // uri
        + 1  // decimals
        + 1  // compliance_enabled
        + 1  // permanent_delegate_enabled
        + 1  // transfer_hook_enabled
        + 1  // default_account_frozen
        + 1  // paused
        + 8  // total_minted
        + 8  // total_burned
        + 1 + 32  // pauser
        + 1 + 32  // burner
        + 1 + 32  // blacklister
        + 1 + 32  // seizer
        + 1 + 32  // transfer_hook_program_id
        + 1; // bump
}

// ─── Minter Registry ─────────────────────────────────────────────────────────

#[account]
pub struct MinterInfo {
    pub stablecoin: Pubkey,
    pub minter: Pubkey,
    /// 0 = unlimited
    pub quota: u64,
    pub minted_this_epoch: u64,
    pub active: bool,
    pub bump: u8,
}

impl MinterInfo {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

// ─── Blacklist PDA (SSS-2) ───────────────────────────────────────────────────

#[account]
pub struct BlacklistEntry {
    pub stablecoin: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub added_at: i64,
    pub added_by: Pubkey,
    pub active: bool,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const LEN: usize = 8 + 32 + 32 + (4 + 256) + 8 + 32 + 1 + 1;
}

// ─── Config passed into initialize ───────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StablecoinConfig {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    // SSS-2
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub transfer_hook_program_id: Option<Pubkey>,
}

// ─── Role update payload ─────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RoleUpdate {
    pub pauser: Option<Pubkey>,
    pub burner: Option<Pubkey>,
    pub blacklister: Option<Pubkey>,
    pub seizer: Option<Pubkey>,
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

#[account]
pub struct AuditEntry {
    pub stablecoin: Pubkey,
    pub action: String,
    pub actor: Pubkey,
    pub target: Option<Pubkey>,
    pub amount: Option<u64>,
    pub reason: Option<String>,
    pub timestamp: i64,
    pub bump: u8,
}

impl AuditEntry {
    pub const LEN: usize = 8 + 32 + (4 + 32) + 32 + (1 + 32) + (1 + 8) + (1 + 4 + 256) + 8 + 1;
}