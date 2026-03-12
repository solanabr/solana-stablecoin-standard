use anchor_lang::prelude::*;

// ─── Core Events ────────────────────────────────────────────────────────────

#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub master_authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub compliance_enabled: bool,
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub minter: Pubkey,
    pub total_supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub burner: Pubkey,
    pub total_supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct AccountFrozen {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AccountThawed {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProtocolPaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProtocolUnpaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MinterUpdated {
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub quota: u64,
    pub active: bool,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RolesUpdated {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityProposed {
    pub mint: Pubkey,
    pub current: Pubkey,
    pub proposed: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferred {
    pub mint: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

// ─── SSS-2 Compliance Events ─────────────────────────────────────────────────

#[event]
pub struct AddressBlacklisted {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub blacklister: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AddressUnblacklisted {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub blacklister: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensSeized {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub seizer: Pubkey,
    pub timestamp: i64,
}