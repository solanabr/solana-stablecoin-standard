use anchor_lang::prelude::*;

#[event]
pub struct TokenInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub preset: String,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub timestamp: i64,
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
    pub account: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct AccountThawed {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct TokenPaused {
    pub mint: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct TokenUnpaused {
    pub mint: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct BlacklistAdded {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub by: Pubkey,
    pub timestamp: i64,
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
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct RoleUpdated {
    pub mint: Pubkey,
    pub role: String,
    pub address: Pubkey,
    pub action: String,
}

#[event]
pub struct MinterQuotaUpdated {
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub new_quota: u64,
}
