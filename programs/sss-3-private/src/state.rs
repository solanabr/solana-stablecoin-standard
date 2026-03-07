use anchor_lang::prelude::*;

// ─── Private Stablecoin State ────────────────────────────────────────────────

/// On-chain state for an SSS-3 private stablecoin.
///
/// Extends SSS-1/SSS-2 StablecoinState with fields specific to
/// confidential transfer management.
#[account]
#[derive(Debug)]
pub struct PrivateStablecoinState {
    /// The authority who can manage this stablecoin
    pub authority: Pubkey,
    /// The Token-2022 mint address
    pub mint: Pubkey,
    /// Token name
    pub name: String,
    /// Token symbol
    pub symbol: String,
    /// Token metadata URI
    pub uri: String,
    /// Token decimals
    pub decimals: u8,

    // ─── SSS-3 specific fields ───────────────────────────────

    /// Auditor ElGamal public key — can decrypt all confidential transfer amounts
    pub auditor_elgamal_pubkey: [u8; 32],
    /// Whether auto-approve is enabled (false = manual KYC via allowlist required)
    pub auto_approve: bool,
    /// Number of currently approved allowlist entries
    pub allowlist_count: u64,
    /// Total tokens deposited to confidential balance (cumulative)
    pub total_deposited_confidential: u64,
    /// Total tokens withdrawn from confidential balance (cumulative)
    pub total_withdrawn_confidential: u64,

    // ─── Standard SSS fields ─────────────────────────────────

    /// Whether the stablecoin is paused
    pub paused: bool,
    /// Total minted (all time)
    pub total_minted: u64,
    /// Total burned (all time)
    pub total_burned: u64,
    /// Whether permanent delegate is enabled (SSS-2)
    pub has_permanent_delegate: bool,
    /// Whether transfer hook is enabled (SSS-2)
    pub has_transfer_hook: bool,
    /// Bump seed for PDA derivation
    pub bump: u8,
}

impl PrivateStablecoinState {
    /// Account space: 8 (discriminator) + fields
    pub const SIZE: usize = 8   // discriminator
        + 32                      // authority
        + 32                      // mint
        + (4 + 32)                // name (max 32 chars)
        + (4 + 10)                // symbol (max 10 chars)
        + (4 + 200)               // uri (max 200 chars)
        + 1                       // decimals
        + 32                      // auditor_elgamal_pubkey
        + 1                       // auto_approve
        + 8                       // allowlist_count
        + 8                       // total_deposited_confidential
        + 8                       // total_withdrawn_confidential
        + 1                       // paused
        + 8                       // total_minted
        + 8                       // total_burned
        + 1                       // has_permanent_delegate
        + 1                       // has_transfer_hook
        + 1;                      // bump
}

// ─── Allowlist Entry ─────────────────────────────────────────────────────────

/// PDA representing an approved address on the SSS-3 confidential transfer allowlist.
///
/// Seeds: `["allowlist", state.key(), wallet.key()]`
#[account]
#[derive(Debug)]
pub struct AllowlistEntry {
    /// The PrivateStablecoinState this entry belongs to
    pub state: Pubkey,
    /// The wallet address approved for confidential transfers
    pub wallet: Pubkey,
    /// Whether the address is currently approved
    pub approved: bool,
    /// Unix timestamp of approval
    pub approved_at: i64,
    /// Unix timestamp of revocation (0 if not revoked)
    pub revoked_at: i64,
    /// KYC provider identifier (e.g., "chainalysis", "elliptic", "sumsub")
    pub kyc_provider: String,
    /// Reason for revocation (empty if not revoked)
    pub revocation_reason: String,
    /// Bump seed for PDA derivation
    pub bump: u8,
}

impl AllowlistEntry {
    pub const SIZE: usize = 8   // discriminator
        + 32                      // state
        + 32                      // wallet
        + 1                       // approved
        + 8                       // approved_at
        + 8                       // revoked_at
        + (4 + 32)                // kyc_provider (max 32 chars)
        + (4 + 128)               // revocation_reason (max 128 chars)
        + 1;                      // bump
}
