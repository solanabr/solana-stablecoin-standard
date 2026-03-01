pub mod initialize;
pub mod mint;
pub mod burn;
pub mod freeze;
pub mod pause;
pub mod roles;
pub mod blacklist;
pub mod seize;

pub use initialize::*;
pub use mint::*;
pub use burn::*;
pub use freeze::*;
pub use pause::*;
pub use roles::*;
pub use blacklist::*;
pub use seize::*;

use anchor_lang::prelude::*;

/// Configuration passed during initialization.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StablecoinConfig {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
}

/// Custom errors for the SSS Token program.
#[error_code]
pub enum SssError {
    #[msg("The stablecoin is currently paused")]
    Paused,
    #[msg("Unauthorized: caller lacks the required role")]
    Unauthorized,
    #[msg("Minter quota exceeded")]
    QuotaExceeded,
    #[msg("Compliance features not enabled on this stablecoin")]
    ComplianceNotEnabled,
    #[msg("Address is blacklisted")]
    Blacklisted,
    #[msg("Address is not blacklisted")]
    NotBlacklisted,
    #[msg("Name too long (max 32 chars)")]
    NameTooLong,
    #[msg("Symbol too long (max 10 chars)")]
    SymbolTooLong,
    #[msg("URI too long (max 200 chars)")]
    UriTooLong,
    #[msg("Reason too long (max 128 chars)")]
    ReasonTooLong,
}
