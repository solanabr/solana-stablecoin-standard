use anchor_lang::prelude::*;

/// On-chain configuration for a stablecoin instance.
#[account]
#[derive(InitSpace)]
pub struct StablecoinState {
    /// The mint address of the stablecoin.
    pub mint: Pubkey,
    /// Master authority — can assign/revoke all roles and upgrade config.
    pub master_authority: Pubkey,
    /// Pending authority for two-step transfer.
    pub pending_authority: Option<Pubkey>,
    /// Human-readable name.
    #[max_len(32)]
    pub name: String,
    /// Ticker symbol.
    #[max_len(10)]
    pub symbol: String,
    /// Metadata URI.
    #[max_len(200)]
    pub uri: String,
    /// Token decimals.
    pub decimals: u8,
    /// Whether the stablecoin supports SSS-2 compliance features.
    pub compliance_enabled: bool,
    /// Whether permanent delegate is enabled (SSS-2).
    pub permanent_delegate_enabled: bool,
    /// Whether transfer hook is enabled (SSS-2).
    pub transfer_hook_enabled: bool,
    /// Whether new token accounts default to frozen.
    pub default_account_frozen: bool,
    /// Global pause flag — when true, minting and burning are halted.
    pub paused: bool,
    /// Total number of minters registered.
    pub minter_count: u16,
    /// Bump seed for PDA derivation.
    pub bump: u8,
}

/// Per-minter configuration with optional quota.
#[account]
#[derive(InitSpace)]
pub struct MinterState {
    /// The stablecoin state this minter belongs to.
    pub stablecoin: Pubkey,
    /// The minter's public key.
    pub minter: Pubkey,
    /// Maximum amount this minter can mint (None = unlimited).
    pub quota: Option<u64>,
    /// Amount already minted by this minter.
    pub minted: u64,
    /// Whether this minter is currently active.
    pub active: bool,
    pub bump: u8,
}

/// Role assignment account — maps a role to an assignee for a stablecoin.
#[account]
#[derive(InitSpace)]
pub struct RoleAssignment {
    pub stablecoin: Pubkey,
    pub role: Role,
    pub assignee: Pubkey,
    pub active: bool,
    pub bump: u8,
}

/// Blacklist entry for SSS-2 compliance.
#[account]
#[derive(InitSpace)]
pub struct BlacklistEntry {
    pub stablecoin: Pubkey,
    pub address: Pubkey,
    #[max_len(128)]
    pub reason: String,
    pub created_at: i64,
    pub bump: u8,
}

/// Supported roles in the stablecoin system.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Role {
    Burner,
    Pauser,
    Blacklister,
    Seizer,
}

impl Role {
    pub fn seed(&self) -> &[u8] {
        match self {
            Role::Burner => b"burner",
            Role::Pauser => b"pauser",
            Role::Blacklister => b"blacklister",
            Role::Seizer => b"seizer",
        }
    }
}
