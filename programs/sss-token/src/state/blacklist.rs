use anchor_lang::prelude::*;

/// Maximum length for the blacklist reason field.
pub const MAX_REASON_LEN: usize = 128;

/// A blacklist entry PDA for a specific address.
///
/// Created when an address is added to the blacklist (SSS-2 only).
/// The transfer hook program checks for the existence of this PDA
/// to block transfers.
///
/// PDA seeds: `[b"blacklist", config.key(), blacklisted_address.key()]`
#[account]
pub struct BlacklistEntry {
    /// The StablecoinConfig this entry belongs to
    pub config: Pubkey,
    /// The blacklisted address
    pub address: Pubkey,
    /// Reason for blacklisting (max 128 chars)
    pub reason: String,
    /// Unix timestamp when the address was blacklisted
    pub blacklisted_at: i64,
    /// Authority who blacklisted this address
    pub blacklisted_by: Pubkey,
    /// PDA bump seed
    pub bump: u8,
}

impl BlacklistEntry {
    /// Calculate the space needed for the account.
    pub const fn space() -> usize {
        8 +     // discriminator
        32 +    // config
        32 +    // address
        (4 + MAX_REASON_LEN) + // reason
        8 +     // blacklisted_at
        32 +    // blacklisted_by
        1       // bump
    }
}
