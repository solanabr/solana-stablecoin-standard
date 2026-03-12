use anchor_lang::prelude::*;

/// Global configuration for a stablecoin deployment.
/// One per stablecoin mint. Stores role assignments, pause state, and audit counters.
///
/// PDA: `[b"config", mint.key().as_ref()]`
#[account]
#[derive(InitSpace)]
pub struct StablecoinConfig {
    // ── Identity ────────────────────────────────────────────────────────────
    /// The Token-2022 mint address for this stablecoin.
    pub mint: Pubkey,

    /// Preset type: 1 = SSS-1 (Minimal), 2 = SSS-2 (Compliant), 3 = SSS-3 (Confidential).
    pub preset: u8,

    // ── Roles (Circle EVM model) ────────────────────────────────────────────
    /// Master authority. Can update all other roles and perform seize (SSS-2).
    pub authority: Pubkey,

    /// Pending authority for two-step ownership transfer. Default = Pubkey::default().
    pub pending_authority: Pubkey,

    /// Master minter. Can configure/remove minters and set quotas.
    pub master_minter: Pubkey,

    /// Pauser. Can pause/unpause all operations.
    pub pauser: Pubkey,

    /// Blacklister. Can add/remove wallets from blacklist (SSS-2 only).
    pub blacklister: Pubkey,

    // ── Global State ────────────────────────────────────────────────────────
    /// Whether operations are paused.
    pub paused: bool,

    /// Lifetime total tokens minted (for audit trail).
    pub total_minted: u64,

    /// Lifetime total tokens burned (for audit trail).
    pub total_burned: u64,

    /// Lifetime total tokens seized via permanent delegate (SSS-2 audit trail).
    pub total_seized: u64,

    // ── PDA Bumps ───────────────────────────────────────────────────────────
    /// Bump for this config PDA.
    pub bump: u8,

    /// Bump for the mint authority PDA.
    pub mint_authority_bump: u8,
}

/// Per-minter state tracking quotas and usage.
///
/// PDA: `[b"minter", config.key().as_ref(), minter.key().as_ref()]`
#[account]
#[derive(InitSpace)]
pub struct MinterState {
    /// The parent stablecoin config.
    pub config: Pubkey,

    /// The minter's wallet address.
    pub minter: Pubkey,

    /// Maximum tokens this minter is allowed to mint.
    pub quota: u64,

    /// Tokens minted so far (consumed quota). Burning does NOT reduce this.
    pub minted_amount: u64,

    /// Whether this minter is currently active.
    pub enabled: bool,

    /// Bump for this minter PDA.
    pub bump: u8,
}

/// Per-wallet allowlist entry for SSS-3 confidential transfer approval.
/// Tracks which accounts the confidential transfer authority has approved.
///
/// PDA: `[b"allowlist", mint.key().as_ref(), wallet.key().as_ref()]`
#[account]
#[derive(InitSpace)]
pub struct AllowlistEntry {
    /// The stablecoin mint this entry belongs to.
    pub mint: Pubkey,

    /// The wallet address being approved/revoked.
    pub wallet: Pubkey,

    /// Whether this wallet is currently approved for confidential transfers.
    pub approved: bool,

    /// Who initiated the approval.
    pub approved_by: Pubkey,

    /// Unix timestamp when approved.
    pub approved_at: i64,

    /// Bump for this PDA.
    pub bump: u8,
}

/// Role type enum for the update_role instruction.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum RoleType {
    MasterMinter,
    Pauser,
    Blacklister,
}

impl std::fmt::Display for RoleType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RoleType::MasterMinter => write!(f, "master_minter"),
            RoleType::Pauser => write!(f, "pauser"),
            RoleType::Blacklister => write!(f, "blacklister"),
        }
    }
}
