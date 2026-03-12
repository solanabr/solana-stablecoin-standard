/// PDA seed for the stablecoin configuration account.
pub const CONFIG_SEED: &[u8] = b"config";

/// PDA seed for the mint authority (also freeze authority and permanent delegate).
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint-authority";

/// PDA seed prefix for per-minter state accounts.
pub const MINTER_SEED: &[u8] = b"minter";

/// SSS-1: Minimal stablecoin preset.
pub const PRESET_MINIMAL: u8 = 1;

/// SSS-2: Compliant stablecoin preset with blacklist, seize, and KYC gating.
pub const PRESET_COMPLIANT: u8 = 2;

/// SSS-3: Confidential stablecoin preset — SSS-2 plus ConfidentialTransferMint.
/// Confidential transfers bypass the transfer hook, so compliance uses
/// allowlist-based approval via the confidential transfer authority instead.
pub const PRESET_CONFIDENTIAL: u8 = 3;

/// PDA seed for per-wallet allowlist entries (SSS-3 confidential transfer approval).
pub const ALLOWLIST_SEED: &[u8] = b"allowlist";

/// Maximum allowed decimals for a stablecoin mint.
pub const MAX_DECIMALS: u8 = 9;

/// Maximum length for stablecoin name in token metadata.
pub const MAX_NAME_LEN: usize = 32;

/// Maximum length for stablecoin symbol in token metadata.
pub const MAX_SYMBOL_LEN: usize = 10;

/// Maximum length for stablecoin URI in token metadata.
pub const MAX_URI_LEN: usize = 200;
