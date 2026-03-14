use anchor_lang::prelude::*;

/// Privacy configuration for SSS-3 stablecoins
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct PrivacyConfig {
    /// Whether an allowlist is required for confidential transfers
    pub allowlist_required: bool,
    /// Whether confidential transfers are enabled
    pub confidential_transfers_enabled: bool,
}

/// Allowlist entry for confidential transfer participants
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AllowlistEntry {
    /// The config this entry is associated with
    pub config: Pubkey,
    /// The allowed address
    pub address: Pubkey,
    /// PDA bump
    pub bump: u8,
}
