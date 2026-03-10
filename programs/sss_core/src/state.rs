use anchor_lang::prelude::*;

#[account]
pub struct StablecoinConfig {
    pub authority: Pubkey,         // 32
    pub mint: Pubkey,              // 32
    pub name: String,              // 4 + 32 (max)
    pub symbol: String,            // 4 + 10 (max)
    pub uri: String,               // 4 + 100 (max)
    pub decimals: u8,              // 1
    pub is_paused: bool,           // 1
    pub enable_permanent_delegate: bool, // 1
    pub enable_transfer_hook: bool,      // 1
    pub bump: u8,                  // 1
    
    // Роли
    pub minter_authority: Pubkey,  // 32
    pub burner_authority: Pubkey,  // 32
    pub freezer_authority: Pubkey, // 32
}

impl StablecoinConfig {
    // ВАЖНО: Добавил запас в 50 байт, чтобы сериализация никогда не падала
    pub const INIT_SPACE: usize = 32 + 32 + (4 + 32) + (4 + 10) + (4 + 100) + 1 + 1 + 1 + 1 + 1 + 32 + 32 + 32 + 50;
}