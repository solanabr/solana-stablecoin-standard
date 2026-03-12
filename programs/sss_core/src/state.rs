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
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,      
    
    // --- SSS-3: ПРИВАТНОСТЬ ---
    pub enable_confidential_transfers: bool, // Включены ли скрытые переводы
    pub auditor: Pubkey,                     // Кто имеет право расшифровывать суммы

    pub oracle_feed: Option<Pubkey>,
    
    pub bump: u8,
    pub minter_authority: Pubkey,
    pub burner_authority: Pubkey,
    pub freezer_authority: Pubkey,
    pub seizer_authority: Pubkey,
}

impl StablecoinConfig {
    // Увеличили размер на 33 байта (1 байт Option + 32 байта Pubkey)
    pub const INIT_SPACE: usize = 32 + 32 + (4 + 32) + (4 + 10) + (4 + 100) + 1 + 1 + 1 + 1 + 1 + 32 + 1 + 32 + 33 + 32 + 32 + 32 + 32 + 50;
}

#[account]
pub struct MockOracle {
    pub price: u64, // Цена актива с 6 нулями (например, 1.10 USD = 1_100_000)
    pub decimals: u8,
}

impl MockOracle {
    pub const INIT_SPACE: usize = 8 + 8 + 1;
}