use anchor_lang::prelude::*;

// Seeds
pub const CONFIG_SEED: &[u8] = b"config";
pub const MINTER_SEED: &[u8] = b"minter";
pub const ROLE_SEED: &[u8] = b"role";
pub const BLACKLIST_SEED: &[u8] = b"blacklist";

#[account]
#[derive(InitSpace)]
pub struct StablecoinConfig {
    /// Master authority — can perform all privileged operations.
    pub authority: Pubkey, // 32

    /// Pending authority nominee for two-step transfer.
    pub pending_authority: Option<Pubkey>, // 33

    /// Token-2022 mint this config governs.
    pub mint: Pubkey, // 32

    /// Emergency pause flag — blocks mint and burn when true.
    pub paused: bool, // 1

    // ── SSS-2 flags (set at initialize, immutable after) ──────────────────
    /// Whether a permanent delegate extension is enabled on the mint.
    pub enable_permanent_delegate: bool, // 1

    /// Whether a transfer hook extension is enabled on the mint.
    pub enable_transfer_hook: bool, // 1

    /// Whether newly created token accounts default to Frozen state.
    pub default_account_frozen: bool, // 1

    /// Transfer hook program ID (SSS-2 only).
    pub hook_program_id: Option<Pubkey>, // 33

    /// Canonical PDA bump stored at init.
    pub bump: u8, // 1

    /// Reserved for future fields — keeps account size stable.
    pub _reserved: [u8; 64], // 64
}

#[account]
#[derive(InitSpace)]
pub struct MinterRole {
    /// The account authorised to call `mint_to`.
    pub minter: Pubkey, // 32

    /// Mint this minter entry is scoped to.
    pub mint: Pubkey, // 32

    /// Maximum cumulative tokens this minter may issue (0 = unlimited).
    pub quota: u64, // 8

    /// Running total of tokens minted so far.
    pub minted: u64, // 8

    /// Whether this entry is currently active.
    pub active: bool, // 1

    /// Canonical PDA bump.
    pub bump: u8, // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RoleType {
    Blacklister = 0,
    Pauser = 1,
    Seizer = 2,
    Burner = 3,
    Freezer = 4,
}

#[account]
#[derive(InitSpace)]
pub struct RoleEntry {
    /// The address that holds this role.
    pub address: Pubkey, // 32

    /// Mint this role entry is scoped to.
    pub mint: Pubkey, // 32

    /// Which compliance role this entry represents.
    pub role: RoleType, // 1

    /// Whether this role is currently active.
    pub active: bool, // 1

    /// Canonical PDA bump.
    pub bump: u8, // 1
}

#[account]
#[derive(InitSpace)]
pub struct BlacklistEntry {
    /// The blacklisted address (wallet or token account).
    pub address: Pubkey, // 32

    /// Mint this blacklist entry is scoped to.
    pub mint: Pubkey, // 32

    /// Human-readable reason for blacklisting (max 128 bytes).
    #[max_len(128)]
    pub reason: String, // 4 + 128

    /// Unix timestamp when the address was blacklisted.
    pub blacklisted_at: i64, // 8

    /// Who performed the blacklisting.
    pub blacklisted_by: Pubkey, // 32

    /// Whether this entry is currently active (false = removed from blacklist).
    pub active: bool, // 1

    /// Canonical PDA bump.
    pub bump: u8, // 1
}
