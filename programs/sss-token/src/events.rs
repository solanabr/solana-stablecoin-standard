use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub supply_cap: u64,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub new_supply: u64,
    pub minter: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub amount: u64,
    pub new_supply: u64,
    pub burner: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AccountFrozenEvent {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AccountThawedEvent {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StablecoinPaused {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StablecoinUnpaused {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BlacklistAdded {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub reason: String,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BlacklistRemoved {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensSeized {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RoleUpdated {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub role: String,
    pub granted: bool,
    pub authority: Pubkey,
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
pub struct AuthorityNominated {
    pub mint: Pubkey,
    pub current_authority: Pubkey,
    pub pending_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityAccepted {
    pub mint: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SupplyCapUpdated {
    pub mint: Pubkey,
    pub old_cap: u64,
    pub new_cap: u64,
    pub authority: Pubkey,
    pub timestamp: i64,
}
