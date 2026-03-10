use anchor_lang::prelude::*;

/// Configuration for the transfer hook program instance.
///
/// PDA: `[b"hook-config", mint.key().as_ref()]`
#[account]
#[derive(InitSpace)]
pub struct HookConfig {
    /// The Token-2022 mint this hook serves.
    pub mint: Pubkey,

    /// The core program's StablecoinConfig PDA (for reading pause state and roles).
    pub stablecoin_config: Pubkey,

    /// The core program ID (for PDA validation).
    pub core_program: Pubkey,

    /// Bump for this PDA.
    pub bump: u8,
}

/// Blacklist entry for a single wallet address.
///
/// PDA: `[b"blacklist", mint.key().as_ref(), wallet.key().as_ref()]`
#[account]
#[derive(InitSpace)]
pub struct BlacklistEntry {
    /// The stablecoin mint this entry belongs to.
    pub mint: Pubkey,

    /// The blacklisted wallet address.
    pub wallet: Pubkey,

    /// Whether this wallet is currently blacklisted.
    pub blacklisted: bool,

    /// Human-readable reason for blacklisting.
    #[max_len(64)]
    pub reason: String,

    /// Unix timestamp when blacklisted.
    pub blacklisted_at: i64,

    /// Who initiated the blacklisting.
    pub blacklisted_by: Pubkey,

    /// Bump for this PDA.
    pub bump: u8,
}

/// PDA seeds for hook config.
pub const HOOK_CONFIG_SEED: &[u8] = b"hook-config";

/// PDA seeds for blacklist entries.
pub const BLACKLIST_SEED: &[u8] = b"blacklist";

/// PDA seeds for the extra account meta list (standard from spl-transfer-hook-interface).
pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";
