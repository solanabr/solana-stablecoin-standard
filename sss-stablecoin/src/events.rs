use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
}

#[event]
pub struct Minted {
    pub minter: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Burned {
    pub burner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AccountFrozen {
    pub authority: Pubkey,
    pub target: Pubkey,
}

#[event]
pub struct AccountThawed {
    pub authority: Pubkey,
    pub target: Pubkey,
}

#[event]
pub struct Paused {
    pub authority: Pubkey,
}

#[event]
pub struct Unpaused {
    pub authority: Pubkey,
}

#[event]
pub struct RoleUpdated {
    pub role_type: String,
    pub address: Pubkey,
    pub action: String,
}

#[event]
pub struct AuthorityTransferProposed {
    pub current_authority: Pubkey,
    pub proposed_authority: Pubkey,
}

#[event]
pub struct AuthorityTransferAccepted {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct AddedToBlacklist {
    pub blacklister: Pubkey,
    pub address: Pubkey,
    pub reason: String,
}

#[event]
pub struct RemovedFromBlacklist {
    pub blacklister: Pubkey,
    pub address: Pubkey,
}

#[event]
pub struct TokensSeized {
    pub seizer: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}
