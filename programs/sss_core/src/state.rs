// programs/sss_core/src/state.rs
use anchor_lang::prelude::*;

#[account]
pub struct StablecoinConfig {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub is_paused: bool,
    pub enable_permanent_delegate: bool, // Включается при создании
    pub enable_transfer_hook: bool,      
    pub bump: u8,
    
    // Роли
    pub minter_authority: Pubkey,
    pub burner_authority: Pubkey,
    pub freezer_authority: Pubkey,
    pub seizer_authority: Pubkey, // <--- Добавили роль сейзера
}

impl StablecoinConfig {
    pub const INIT_SPACE: usize = 32 + 32 + (4 + 32) + (4 + 10) + (4 + 100) + 1 + 1 + 1 + 1 + 1 + 32 + 32 + 32 + 32 + 50;
}