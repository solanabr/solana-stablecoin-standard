use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub preset: u8,
    pub name: String,
    pub symbol: String,
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub minter: Pubkey,
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub burner: Pubkey,
}

#[event]
pub struct AccountFrozen {
    pub mint: Pubkey,
    pub token_account: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct AccountThawed {
    pub mint: Pubkey,
    pub token_account: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct ContractPaused {
    pub mint: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct ContractUnpaused {
    pub mint: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct MinterUpdated {
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub quota: u64,
    pub active: bool,
}

#[event]
pub struct RolesUpdated {
    pub mint: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct BlacklistAdded {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub by: Pubkey,
}

#[event]
pub struct BlacklistRemoved {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct TokensSeized {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub by: Pubkey,
}

#[event]
pub struct AuthorityTransferred {
    pub mint: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}
