use anchor_lang::prelude::*;

/// Preset standards for stablecoin configuration.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Preset {
    /// SSS-1: Minimal stablecoin with mint/freeze authority, metadata, and role management.
    SSS1,
    /// SSS-2: Compliant stablecoin adding permanent delegate, transfer hook blacklist enforcement.
    SSS2,
    /// Custom configuration with individually selected features.
    Custom,
}

/// Feature flags for custom configurations.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default)]
pub struct FeatureFlags {
    /// Enable freeze authority on the mint.
    pub freeze_authority: bool,
    /// Enable permanent delegate extension (required for seize).
    pub permanent_delegate: bool,
    /// Enable transfer hook for blacklist enforcement.
    pub transfer_hook: bool,
    /// Enable confidential transfers (SSS-3 experimental).
    pub confidential_transfers: bool,
}

impl FeatureFlags {
    pub fn sss1() -> Self {
        Self {
            freeze_authority: true,
            permanent_delegate: false,
            transfer_hook: false,
            confidential_transfers: false,
        }
    }

    pub fn sss2() -> Self {
        Self {
            freeze_authority: true,
            permanent_delegate: true,
            transfer_hook: true,
            confidential_transfers: false,
        }
    }
}

/// Core configuration account for a stablecoin instance.
/// PDA seeds: [b"stablecoin-config", mint.key()]
#[account]
#[derive(Debug)]
pub struct StablecoinConfig {
    pub bump: u8,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub preset: Preset,
    pub features: FeatureFlags,
    pub paused: bool,
    /// Whether new token accounts should be frozen by default.
    /// When true, accounts must be explicitly thawed before use.
    pub default_account_frozen: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    pub decimals: u8,
    pub name: [u8; 32],
    pub symbol: [u8; 10],
    pub transfer_hook_program: Pubkey,
    pub created_at: u64,
    pub updated_at: u64,
    pub _reserved: [u8; 128],
}

impl StablecoinConfig {
    pub const LEN: usize = 8  // discriminator
        + 1    // bump
        + 32   // mint
        + 32   // authority
        + 1    // preset (enum)
        + 4    // features
        + 1    // paused
        + 1    // default_account_frozen
        + 8    // total_minted
        + 8    // total_burned
        + 1    // decimals
        + 32   // name
        + 10   // symbol
        + 32   // transfer_hook_program
        + 8    // created_at
        + 8    // updated_at
        + 128; // _reserved

    pub fn is_compliance_enabled(&self) -> bool {
        self.features.permanent_delegate && self.features.transfer_hook
    }

    pub fn circulating_supply(&self) -> u64 {
        self.total_minted.saturating_sub(self.total_burned)
    }
}
