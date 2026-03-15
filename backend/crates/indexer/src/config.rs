use carbon_stablecoin_decoder::PROGRAM_ID as STABLECOIN_PROGRAM_ID;

#[derive(Debug, Clone)]
pub struct IndexerConfig {
    pub database_url: String,
    pub rpc_url: String,
    /// RPC URL for indexer datasource. If set, used instead of rpc_url.
    /// With Helius RPC, carbon-transaction-crawler (HTTP) is used; otherwise blockSubscribe (WebSocket).
    pub indexer_rpc_url: Option<String>,
    pub stablecoin_program_id: String,
    pub transfer_hook_program_id: String,
    pub start_slot: i64,
    pub disable_block_subscribe: bool,
}

impl IndexerConfig {
    pub fn from_env() -> Self {
        let rpc_url = std::env::var("SOLANA_RPC_URL")
            .unwrap_or_else(|_| "https://api.devnet.solana.com".to_string());
        Self {
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://localhost/sss_backend".to_string()),
            indexer_rpc_url: std::env::var("SSS_INDEXER_RPC_URL").ok().filter(|s| !s.is_empty()),
            rpc_url,
            stablecoin_program_id: std::env::var("SSS_STABLECOIN_PROGRAM_ID")
                .unwrap_or_else(|_| STABLECOIN_PROGRAM_ID.to_string()),
            transfer_hook_program_id: std::env::var("SSS_TRANSFER_HOOK_PROGRAM_ID")
                .unwrap_or_else(|_| "6QNzPyTwg2MH778GL8idYiU3teFJiuQx6R5L7xdU17KC".to_string()),
            start_slot: std::env::var("SSS_START_SLOT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(0),
            disable_block_subscribe: std::env::var("SSS_DISABLE_BLOCK_SUBSCRIBE")
                .ok()
                .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
                .unwrap_or(false),
        }
    }
}
