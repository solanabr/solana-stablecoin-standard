use anchor_lang::prelude::*;

/// Emitted when a new oracle configuration is created
#[event]
pub struct OracleConfigCreatedEvent {
    pub config: Pubkey,
    pub stablecoin_state: Pubkey,
    pub feed_address: Pubkey,
    pub base_currency: String,
    pub authority: Pubkey,
    pub timestamp: i64,
}

/// Emitted when the oracle feed address is updated
#[event]
pub struct OracleFeedUpdatedEvent {
    pub config: Pubkey,
    pub old_feed: Pubkey,
    pub new_feed: Pubkey,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

/// Emitted when a price is read from the oracle
#[event]
pub struct PriceReadEvent {
    pub config: Pubkey,
    pub price: u64,
    pub confidence: u64,
    pub feed_timestamp: i64,
    pub read_timestamp: i64,
}

/// Emitted for oracle-gated mint operations
#[event]
pub struct OracleGatedMintEvent {
    pub config: Pubkey,
    pub recipient: Pubkey,
    pub base_amount: u64,
    pub exchange_rate: u64,
    pub tokens_minted: u64,
    pub base_currency: String,
    pub timestamp: i64,
}

/// Emitted for oracle-gated burn operations
#[event]
pub struct OracleGatedBurnEvent {
    pub config: Pubkey,
    pub burner: Pubkey,
    pub token_amount: u64,
    pub exchange_rate: u64,
    pub base_value: u64,
    pub base_currency: String,
    pub timestamp: i64,
}

/// Emitted when oracle config is toggled on/off
#[event]
pub struct OracleToggledEvent {
    pub config: Pubkey,
    pub enabled: bool,
    pub toggled_by: Pubkey,
    pub timestamp: i64,
}

/// Emitted when oracle authority is proposed or accepted
#[event]
pub struct OracleAuthorityUpdatedEvent {
    pub config: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}
