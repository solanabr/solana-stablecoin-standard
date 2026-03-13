use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub preset: u8,
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub authority: Pubkey,
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub source: Pubkey,
    pub amount: u64,
    pub authority: Pubkey,
}

#[event]
pub struct PauseToggled {
    pub mint: Pubkey,
    pub paused: bool,
    pub authority: Pubkey,
}

#[event]
pub struct BlacklistUpdated {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub added: bool,
    pub authority: Pubkey,
    pub reason: String,
}

#[event]
pub struct TokensSeized {
    pub mint: Pubkey,
    pub from_account: Pubkey,
    pub to_account: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct ComplianceRootUpdated {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub root: String,
}

#[event]
pub struct ProofReceiptUpdated {
    pub mint: Pubkey,
    pub subject: Pubkey,
    pub authority: Pubkey,
    pub expires_at_slot: u64,
    pub revoked: bool,
}
