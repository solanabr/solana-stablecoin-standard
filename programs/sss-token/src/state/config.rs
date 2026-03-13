use anchor_lang::prelude::*;

/// Maximum length for the stablecoin name.
pub const MAX_NAME_LEN: usize = 32;
/// Maximum length for the stablecoin symbol.
pub const MAX_SYMBOL_LEN: usize = 10;
/// Maximum length for the metadata URI.
pub const MAX_URI_LEN: usize = 200;

/// Core configuration account for a stablecoin instance.
///
/// Created during initialization and stores all immutable feature flags
/// and mutable operational state. One per stablecoin deployment.
///
/// PDA seeds: `[b"config", mint.key()]`
#[account]
pub struct StablecoinConfig {
    /// Master authority — can update roles, transfer authority
    pub authority: Pubkey,
    /// The Token-2022 mint address
    pub mint: Pubkey,
    /// Human-readable name (max 32 chars)
    pub name: String,
    /// Ticker symbol (max 10 chars)
    pub symbol: String,
    /// Metadata URI (max 200 chars)
    pub uri: String,
    /// Token decimals (typically 6 for stablecoins)
    pub decimals: u8,
    /// Whether all operations are paused
    pub is_paused: bool,
    /// Total tokens ever minted (cumulative)
    pub total_minted: u64,
    /// Total tokens ever burned (cumulative)
    pub total_burned: u64,

    // ── Feature flags (set at init, immutable after) ──────────────────
    /// SSS-2: Enable permanent delegate for token seizure
    pub enable_permanent_delegate: bool,
    /// SSS-2: Enable transfer hook for blacklist enforcement
    pub enable_transfer_hook: bool,
    /// SSS-3: Enable confidential transfers (experimental)
    pub enable_confidential_transfers: bool,
    /// SSS-2: New token accounts start frozen (requires explicit thaw)
    pub default_account_frozen: bool,

    /// PDA bump seed
    pub bump: u8,
}

impl StablecoinConfig {
    /// Calculate the space needed for the account.
    /// 8 (discriminator) + field sizes
    pub const fn space() -> usize {
        8 +     // discriminator
        32 +    // authority
        32 +    // mint
        (4 + MAX_NAME_LEN) +    // name (String: 4 bytes len + data)
        (4 + MAX_SYMBOL_LEN) +  // symbol
        (4 + MAX_URI_LEN) +     // uri
        1 +     // decimals
        1 +     // is_paused
        8 +     // total_minted
        8 +     // total_burned
        1 +     // enable_permanent_delegate
        1 +     // enable_transfer_hook
        1 +     // enable_confidential_transfers
        1 +     // default_account_frozen
        1 // bump
    }

    /// Returns true if SSS-2 compliance features are enabled.
    pub fn is_compliance_enabled(&self) -> bool {
        self.enable_permanent_delegate && self.enable_transfer_hook
    }
}
