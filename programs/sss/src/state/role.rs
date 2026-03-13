use anchor_lang::prelude::*;
use anchor_lang::prelude::borsh;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum GlobalRole {
    MasterAuthority,
    Minter,
    Burner,
    Pauser,
    Blacklister,
    Seizer,
    ComplianceAdmin,
}

// PDA Seed: b"role", config.key(), authority.key()
#[account]
pub struct RoleRegistry {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub has_minter: bool,
    pub has_burner: bool,
    pub has_pauser: bool,
    pub has_blacklister: bool,
    pub has_seizer: bool,
    pub has_compliance_admin: bool,
    pub bump: u8,
}

impl RoleRegistry {
    pub const LEN: usize = 8 // discriminator
        + 32 // config
        + 32 // authority
        + 1  // has_minter
        + 1  // has_burner
        + 1  // has_pauser
        + 1  // has_blacklister
        + 1  // has_seizer
        + 1  // has_compliance_admin
        + 1; // bump
}
