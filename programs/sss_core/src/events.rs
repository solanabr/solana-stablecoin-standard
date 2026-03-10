use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitializedEvent {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
}

#[event]
pub struct MintEvent {
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BurnEvent {
    pub from: Pubkey,
    pub amount: u64,
}

#[event]
pub struct SeizedEvent {
    pub from: Pubkey,
    pub amount: u64,
}