use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Preset {
    SSS1 = 0, // Minimal: mint + metadata + roles
    SSS2 = 1, // Compliant: SSS-1 + PermanentDelegate + TransferHook + DefaultAccountState
    SSS3 = 2, // Confidential: SSS-2 + ConfidentialTransferMint
}

impl Preset {
    /// Returns true for presets with compliance features (PermanentDelegate, TransferHook, DefaultAccountState).
    pub fn has_compliance_features(&self) -> bool {
        matches!(self, Preset::SSS2 | Preset::SSS3)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Role {
    Minter = 0,
    Burner = 1,
    Seizer = 2,
    Pauser = 3,
    ComplianceOfficer = 4,
}

impl Role {
    pub fn discriminant(&self) -> u8 {
        *self as u8
    }
}

#[account]
pub struct StablecoinConfig {
    pub admin: Pubkey,
    pub pending_admin: Pubkey,          // NEW: two-step admin transfer
    pub mint: Pubkey,
    pub preset: Preset,
    pub paused: bool,
    pub transfer_hook_program: Pubkey,  // RENAMED from gate_program
    pub treasury: Pubkey,               // NEW: where seized funds go
    pub total_minted: u64,
    pub total_burned: u64,
    pub total_seized: u64,              // NEW: track seized amounts
    pub bump: u8,
}

impl StablecoinConfig {
    pub const LEN: usize = 8  // discriminator
        + 32  // admin
        + 32  // pending_admin
        + 32  // mint
        + 1   // preset
        + 1   // paused
        + 32  // transfer_hook_program
        + 32  // treasury
        + 8   // total_minted
        + 8   // total_burned
        + 8   // total_seized
        + 1;  // bump
}

#[account]
pub struct RoleAccount {
    pub config: Pubkey,
    pub holder: Pubkey,
    pub role: Role,
    pub allowance: u64,   // NEW: decrementing allowance (used by Minter role only)
    pub bump: u8,
}

impl RoleAccount {
    pub const LEN: usize = 8  // discriminator
        + 32  // config
        + 32  // holder
        + 1   // role
        + 8   // allowance
        + 1;  // bump
}
