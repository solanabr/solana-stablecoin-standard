use anchor_lang::prelude::*;

#[event]
pub struct MintEvent {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BurnEvent {
    pub config: Pubkey,
    pub burner: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BlacklistAddEvent {
    pub config: Pubkey,
    pub account: Pubkey,
    pub reason: String,
    pub by: Pubkey,
}

#[event]
pub struct BlacklistRemoveEvent {
    pub config: Pubkey,
    pub account: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct SeizeEvent {
    pub config: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub by: Pubkey,
}

#[event]
pub struct PauseEvent {
    pub config: Pubkey,
    pub is_paused: bool,
    pub by: Pubkey,
}
