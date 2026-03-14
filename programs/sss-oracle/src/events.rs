use anchor_lang::prelude::*;

#[event]
pub struct OracleInitialized {
    pub authority: Pubkey,
    pub price_feed: Pubkey,
    pub max_deviation_bps: u16,
    pub max_staleness_secs: u64,
    pub expected_price: u64,
    pub price_decimals: u8,
}

#[event]
pub struct OracleConfigUpdated {
    pub authority: Pubkey,
    pub price_feed: Pubkey,
    pub max_deviation_bps: u16,
    pub max_staleness_secs: u64,
    pub expected_price: u64,
    pub price_decimals: u8,
    pub enabled: bool,
}

#[event]
pub struct PriceValidated {
    pub oracle_config: Pubkey,
    pub is_valid: bool,
    pub price: u64,
    pub deviation_bps: u64,
    pub age_secs: i64,
}
