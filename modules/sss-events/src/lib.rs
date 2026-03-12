use anchor_lang::prelude::*;

// ── Core lifecycle events ───────────────────────────────────────────────────

#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub preset: u8,
    pub authority: Pubkey,
    pub decimals: u8,
    pub name: String,
    pub symbol: String,
}

// ── Minter management events ────────────────────────────────────────────────

#[event]
pub struct MinterConfigured {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub quota: u64,
    pub configured_by: Pubkey,
}

#[event]
pub struct MinterRemoved {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub removed_by: Pubkey,
}

// ── Token operation events ──────────────────────────────────────────────────

#[event]
pub struct TokensMinted {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub remaining_quota: u64,
}

#[event]
pub struct TokensBurned {
    pub config: Pubkey,
    pub burner: Pubkey,
    pub amount: u64,
    pub total_burned: u64,
}

// ── Account management events ───────────────────────────────────────────────

#[event]
pub struct AccountFrozen {
    pub config: Pubkey,
    pub token_account: Pubkey,
    pub frozen_by: Pubkey,
}

#[event]
pub struct AccountThawed {
    pub config: Pubkey,
    pub token_account: Pubkey,
    pub thawed_by: Pubkey,
}

// ── Pause events ────────────────────────────────────────────────────────────

#[event]
pub struct Paused {
    pub config: Pubkey,
    pub paused_by: Pubkey,
}

#[event]
pub struct Unpaused {
    pub config: Pubkey,
    pub unpaused_by: Pubkey,
}

// ── Role management events ──────────────────────────────────────────────────

#[event]
pub struct RoleUpdated {
    pub config: Pubkey,
    pub role: String,
    pub old_value: Pubkey,
    pub new_value: Pubkey,
    pub updated_by: Pubkey,
}

#[event]
pub struct AuthorityTransferInitiated {
    pub config: Pubkey,
    pub current_authority: Pubkey,
    pub pending_authority: Pubkey,
}

#[event]
pub struct AuthorityTransferAccepted {
    pub config: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

// ── Compliance events (SSS-2) ───────────────────────────────────────────────

#[event]
pub struct TokensSeized {
    pub config: Pubkey,
    pub from_account: Pubkey,
    pub to_account: Pubkey,
    pub amount: u64,
    pub seized_by: Pubkey,
}

#[event]
pub struct HookInitialized {
    pub mint: Pubkey,
    pub hook_config: Pubkey,
}

#[event]
pub struct AddedToBlacklist {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub reason: String,
    pub blacklisted_by: Pubkey,
}

#[event]
pub struct RemovedFromBlacklist {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub removed_by: Pubkey,
}

// ── Confidential transfer events (SSS-3) ────────────────────────────────────

#[event]
pub struct ConfidentialAccountApproved {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub token_account: Pubkey,
    pub approved_by: Pubkey,
}

#[event]
pub struct ConfidentialAccountRevoked {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub revoked_by: Pubkey,
}
