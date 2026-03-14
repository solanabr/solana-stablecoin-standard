//! Account state definitions for SSS Stablecoin

use anchor_lang::prelude::*;

/// Global configuration for a stablecoin mint
///
/// PDA derived with: ["config", mint]
#[account]
#[derive(InitSpace)]
pub struct StablecoinConfig {
    pub bump: u8,
    pub mint: Pubkey,
    pub preset: u8,
    pub decimals: u8,
    #[max_len(32)]
    pub name: String,
    #[max_len(12)]
    pub symbol: String,
    #[max_len(200)]
    pub uri: String,
    pub master_authority: Pubkey,
    pub pauser: Pubkey,
    pub burner: Pubkey,
    pub blacklister: Pubkey,
    pub seizer: Pubkey,
    pub treasury: Pubkey,
    pub compliance_enabled: bool,
    pub paused: bool,
    pub seize_requires_blacklist: bool,
    pub permanent_delegate_enabled: bool,
    pub transfer_hook_enabled: bool,
    pub default_account_frozen: bool,
    pub transfer_hook_program: Pubkey,
}

/// Role configuration for minter authorities
///
/// PDA derived with: ["minter", config, authority]
#[account]
#[derive(InitSpace)]
pub struct MinterRole {
    pub bump: u8,
    pub config: Pubkey,
    pub authority: Pubkey,
    pub active: bool,
    pub quota_amount: u64,
    pub window_seconds: i64,
    pub window_start_ts: i64,
    pub minted_in_window: u64,
}

/// Compliance record for tracking blacklist status
///
/// PDA derived with: ["compliance", mint, wallet]
#[account]
#[derive(InitSpace)]
pub struct ComplianceRecord {
    pub bump: u8,
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub blacklisted: bool,
    pub reason_hash: [u8; 32],
    pub updated_at: i64,
}
