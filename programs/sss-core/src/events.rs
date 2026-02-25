use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub preset: u8,
    pub supply_cap: Option<u64>,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub minter: Pubkey,
    pub new_supply: u64,
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub burner: Pubkey,
    pub new_supply: u64,
}

#[event]
pub struct AccountFrozen {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub freezer: Pubkey,
}

#[event]
pub struct AccountThawed {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub freezer: Pubkey,
}

#[event]
pub struct OperationsPaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct OperationsUnpaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct TokensSeized {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub seizer: Pubkey,
}

#[event]
pub struct RoleGranted {
    pub config: Pubkey,
    pub address: Pubkey,
    pub role: u8,
    pub granted_by: Pubkey,
}

#[event]
pub struct RoleRevoked {
    pub config: Pubkey,
    pub address: Pubkey,
    pub role: u8,
    pub revoked_by: Pubkey,
}

#[event]
pub struct AuthorityTransferred {
    pub config: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
}

#[event]
pub struct ConfigUpdated {
    pub config: Pubkey,
    pub field: String,
    pub updater: Pubkey,
}
