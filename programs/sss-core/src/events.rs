use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub authority: Pubkey,
    pub preset: u8, // 1 = SSS-1, 2 = SSS-2
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub recipient: Pubkey,
    pub minter: Pubkey,
    pub amount: u64,
    pub new_supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub burner: Pubkey,
    pub amount: u64,
    pub new_supply: u64,
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
pub struct StablecoinPaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StablecoinUnpaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
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
    pub cap: Option<u64>,
    pub active: bool,
    pub timestamp: i64,
}

#[event]
pub struct AddressBlacklisted {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub blacklister: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

#[event]
pub struct AddressRemovedFromBlacklist {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub blacklister: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensSeized {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub seizer: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
