use anchor_lang::prelude::*;

#[account]
pub struct ReserveAttestation {
    pub bump: u8,
    pub config: Pubkey,
    pub index: u64,
    pub reserve_hash: [u8; 32],  // SHA-256 of off-chain reserve proof
    pub total_reserves_usd: u64, // In minor units (cents)
    pub total_outstanding: u64,  // Total stablecoins outstanding
    pub attested_by: Pubkey,
    pub attestation_uri: String, // max 200, link to full report
    pub timestamp: i64,
}

impl ReserveAttestation {
    pub const MAX_URI_LEN: usize = 200;
    pub const SEED_PREFIX: &'static [u8] = b"reserve";

    // 8 + 1 + 32 + 8 + 32 + 8 + 8 + 32 + (4 + 200) + 8
    pub const SPACE: usize = 8 + 1 + 32 + 8 + 32 + 8 + 8 + 32 + (4 + 200) + 8;
}
