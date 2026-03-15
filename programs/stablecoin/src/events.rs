use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub enable_confidential_transfer: bool,
    pub enable_allowlist: bool,
    pub decimals: u8,
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokensBurned {
    pub config: Pubkey,
    pub burner: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct AccountFrozen {
    pub config: Pubkey,
    pub account: Pubkey,
    pub frozen_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AccountThawed {
    pub config: Pubkey,
    pub account: Pubkey,
    pub thawed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StablecoinPaused {
    pub config: Pubkey,
    pub paused_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StablecoinUnpaused {
    pub config: Pubkey,
    pub unpaused_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MinterUpdated {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub quota: u64,
    pub active: bool,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RolesUpdated {
    pub config: Pubkey,
    pub updated_by: Pubkey,
    /// New pauser address, if changed.
    pub new_pauser: Option<Pubkey>,
    /// New freezer address, if changed.
    pub new_freezer: Option<Pubkey>,
    /// New blacklister address, if changed.
    pub new_blacklister: Option<Pubkey>,
    /// New seizer address, if changed.
    pub new_seizer: Option<Pubkey>,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferInitiated {
    pub config: Pubkey,
    pub current_authority: Pubkey,
    pub pending_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferCompleted {
    pub config: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AddedToBlacklist {
    pub config: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub blacklisted_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RemovedFromBlacklist {
    pub config: Pubkey,
    pub address: Pubkey,
    pub removed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensSeized {
    pub config: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub seized_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AddedToAllowlist {
    pub config: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub allowlisted_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RemovedFromAllowlist {
    pub config: Pubkey,
    pub address: Pubkey,
    pub removed_by: Pubkey,
    pub timestamp: i64,
}
