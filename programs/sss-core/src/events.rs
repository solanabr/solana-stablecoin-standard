use anchor_lang::prelude::*;

#[event]
pub struct MintCreated {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub admin: Pubkey,
    pub preset: u8,
    pub name: String,
    pub symbol: String,
}

#[event]
pub struct TokensMinted {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub minter: Pubkey,
    pub remaining_allowance: u64,  // NEW
}

#[event]
pub struct TokensBurned {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub burner: Pubkey,
}

#[event]
pub struct TokensSeized {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub treasury: Pubkey,
    pub seizer: Pubkey,
}

#[event]
pub struct RoleGranted {
    pub config: Pubkey,
    pub holder: Pubkey,
    pub role: u8,
    pub allowance: u64,  // NEW
    pub granted_by: Pubkey,
}

#[event]
pub struct RoleRevoked {
    pub config: Pubkey,
    pub holder: Pubkey,
    pub role: u8,
    pub revoked_by: Pubkey,
}

#[event]
pub struct AllowanceIncremented {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub increment: u64,
    pub new_allowance: u64,
}

#[event]
pub struct WalletBlacklisted {
    pub config: Pubkey,
    pub wallet: Pubkey,
    pub blacklisted_by: Pubkey,
}

#[event]
pub struct WalletUnblacklisted {
    pub config: Pubkey,
    pub wallet: Pubkey,
    pub unblacklisted_by: Pubkey,
}

#[event]
pub struct StablecoinPaused {
    pub config: Pubkey,
    pub paused_by: Pubkey,
}

#[event]
pub struct StablecoinUnpaused {
    pub config: Pubkey,
    pub unpaused_by: Pubkey,
}

#[event]
pub struct AdminTransferInitiated {
    pub config: Pubkey,
    pub current_admin: Pubkey,
    pub pending_admin: Pubkey,
}

#[event]
pub struct AdminTransferAccepted {
    pub config: Pubkey,
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct AccountFrozenEvent {
    pub config: Pubkey,
    pub account: Pubkey,
    pub frozen_by: Pubkey,
}

#[event]
pub struct AccountThawedEvent {
    pub config: Pubkey,
    pub account: Pubkey,
    pub thawed_by: Pubkey,
}

#[event]
pub struct MetadataSet {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub set_by: Pubkey,
}

#[event]
pub struct HookInitialized {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub transfer_hook_program: Pubkey,
    pub initialized_by: Pubkey,
}
