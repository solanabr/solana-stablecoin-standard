use anchor_lang::prelude::*;

#[account]
pub struct StablecoinConfig {
    pub authority: Pubkey,         // Master-ключ (создатель)
    pub mint: Pubkey,              // Адрес токена
    pub is_paused: bool,           // Глобальная пауза
    pub enable_permanent_delegate: bool, 
    pub enable_transfer_hook: bool,      
    pub bump: u8,                  

    // --- РОЛИ (RBAC) ---
    pub minter_authority: Pubkey,  // Кто имеет право печатать (Mint)
    pub burner_authority: Pubkey,  // Кто имеет право сжигать (Burn)
    pub freezer_authority: Pubkey, // Кто имеет право морозить счета (Freeze)
}

impl StablecoinConfig {
    // Вычисляем размер: 8 (Anchor) + (6 * 32) (Pubkeys) + 3 (bool) + 1 (bump)
    pub const INIT_SPACE: usize = 8 + (6 * 32) + 3 + 1;
}