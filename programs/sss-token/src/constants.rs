/// PDA seeds
pub const CONFIG_SEED: &[u8] = b"config";
pub const MINTER_SEED: &[u8] = b"minter";
pub const BLACKLIST_SEED: &[u8] = b"blacklist";

/// Preset identifiers
pub const PRESET_SSS1: u8 = 1;
pub const PRESET_SSS2: u8 = 2;

/// String field max byte lengths (on-chain allocation)
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;
pub const MAX_REASON_LEN: usize = 128;
