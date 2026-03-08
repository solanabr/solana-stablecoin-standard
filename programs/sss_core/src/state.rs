use anchor_lang::prelude::*;

#[account]
pub struct StablecoinConfig {
    pub authority: Pubkey,         // Кто управляет токеном (Master)
    pub mint: Pubkey,              // Адрес самого токена (Mint-аккаунт)
    pub is_paused: bool,           // Аварийная пауза
    pub enable_permanent_delegate: bool, // Флаг для SSS-2 (изъятие средств)
    pub enable_transfer_hook: bool,      // Флаг для SSS-2 (черный список)
    pub bump: u8,                  // Сид для PDA
}

impl StablecoinConfig {
    // Вычисляем размер аккаунта: 8 байт (Anchor) + 32 (Pubkey) + 32 (Pubkey) + 1 + 1 + 1 + 1 (bump)
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 1 + 1 + 1 + 1;
}