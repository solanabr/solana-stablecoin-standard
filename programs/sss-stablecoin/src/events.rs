//! Event definitions for SSS Stablecoin

use anchor_lang::prelude::*;

/// Emitted when a new stablecoin is initialized
#[event]
pub struct Initialized {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub master: Pubkey,
    pub preset: u8,
    pub compliance_enabled: bool,
    pub transfer_hook_enabled: bool,
    pub permanent_delegate_enabled: bool,
}

/// Emitted when mint/freeze control is handed to the config PDA
#[event]
pub struct CreationFinalized {
    pub mint: Pubkey,
    pub config: Pubkey,
    pub authority: Pubkey,
}

/// Emitted when tokens are minted
#[event]
pub struct Minted {
    pub mint: Pubkey,
    pub to: Pubkey,
    pub minter: Pubkey,
    pub amount: u64,
    pub quota_used: u64,
    pub quota_limit: u64,
}

/// Emitted when tokens are burned
#[event]
pub struct Burned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
}

/// Emitted when an account is frozen
#[event]
pub struct AccountFrozen {
    pub mint: Pubkey,
    pub token_account: Pubkey,
    pub authority: Pubkey,
}

/// Emitted when an account is thawed
#[event]
pub struct AccountThawed {
    pub mint: Pubkey,
    pub token_account: Pubkey,
    pub authority: Pubkey,
}

/// Emitted when the stablecoin is paused
#[event]
pub struct Paused {
    pub mint: Pubkey,
    pub authority: Pubkey,
}

/// Emitted when the stablecoin is unpaused
#[event]
pub struct Unpaused {
    pub mint: Pubkey,
    pub authority: Pubkey,
}

/// Emitted when a minter role is updated
#[event]
pub struct MinterUpdated {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub minter: Pubkey,
    pub active: bool,
    pub quota_amount: u64,
    pub window_seconds: i64,
}

/// Emitted when operational roles are updated
#[event]
pub struct RolesUpdated {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub pauser: Pubkey,
    pub burner: Pubkey,
    pub blacklister: Pubkey,
    pub seizer: Pubkey,
    pub treasury: Pubkey,
}

/// Emitted when master authority is transferred
#[event]
pub struct AuthorityTransferred {
    pub mint: Pubkey,
    pub old_master: Pubkey,
    pub new_master: Pubkey,
}

/// Emitted when a wallet's blacklist status changes
#[event]
pub struct BlacklistUpdated {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub blacklisted: bool,
    pub authority: Pubkey,
    pub reason_hash: [u8; 32],
}

/// Emitted when tokens are seized
#[event]
pub struct Seized {
    pub mint: Pubkey,
    pub source: Pubkey,
    pub destination: Pubkey,
    pub source_owner: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub override_requires_blacklist: bool,
}
