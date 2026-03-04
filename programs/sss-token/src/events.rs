use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    /// "sss-1" or "sss-2"
    pub preset: String,
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub minter: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct AccountFrozen {
    pub mint: Pubkey,
    pub account: Pubkey,
    /// true = frozen, false = thawed
    pub frozen: bool,
    pub timestamp: i64,
}

#[event]
pub struct PauseChanged {
    pub mint: Pubkey,
    pub paused: bool,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityNominated {
    pub mint: Pubkey,
    pub current: Pubkey,
    pub nominee: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferred {
    pub mint: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MinterUpdated {
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub active: bool,
    pub quota: u64,
    pub timestamp: i64,
}

#[event]
pub struct RoleUpdated {
    pub mint: Pubkey,
    pub address: Pubkey,
    /// Numeric discriminant of RoleType
    pub role: u8,
    pub active: bool,
    pub timestamp: i64,
}

#[event]
pub struct BlacklistUpdated {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub blacklisted: bool,
    pub reason: String,
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
