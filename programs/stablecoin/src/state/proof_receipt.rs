use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
pub struct ProofReceipt {
    pub mint: Pubkey,
    pub subject: Pubkey,
    pub nullifier: String,
    pub proof_commitment: String,
    pub compliance_root: String,
    pub circuit: String,
    pub verified_by: Pubkey,
    pub verified_at_slot: u64,
    pub expires_at_slot: u64,
    pub bump: u8,
}

impl ProofReceipt {
    pub const MAX_NULLIFIER_LEN: usize = 64;
    pub const MAX_PROOF_COMMITMENT_LEN: usize = 64;
    pub const MAX_COMPLIANCE_ROOT_LEN: usize = 64;
    pub const MAX_COMPLIANCE_CIRCUIT_LEN: usize = 64;

    pub const LEN: usize = 8
        + 32
        + 32
        + (4 + Self::MAX_NULLIFIER_LEN)
        + (4 + Self::MAX_PROOF_COMMITMENT_LEN)
        + (4 + Self::MAX_COMPLIANCE_ROOT_LEN)
        + (4 + Self::MAX_COMPLIANCE_CIRCUIT_LEN)
        + 32
        + 8
        + 8
        + 1;
}
