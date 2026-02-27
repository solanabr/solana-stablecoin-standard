use anchor_lang::prelude::*;

#[account]
pub struct RoleRegistry {
    pub bump: u8,
    pub config: Pubkey,
    pub master_authority: Pubkey,
    pub pauser: Pubkey,
    // SSS-2 roles (Pubkey::default() if not enabled)
    pub blacklister: Pubkey,
    pub seizer: Pubkey,
}

impl RoleRegistry {
    pub const SEED_PREFIX: &'static [u8] = b"roles";

    // 8 (discriminator) + 1 + 32 * 5
    pub const SPACE: usize = 8 + 1 + 32 + 32 + 32 + 32 + 32;

    pub fn has_role(&self, authority: &Pubkey, role: Role) -> bool {
        match role {
            Role::MasterAuthority => self.master_authority == *authority,
            Role::Pauser => self.pauser == *authority || self.master_authority == *authority,
            Role::Blacklister => {
                self.blacklister == *authority || self.master_authority == *authority
            }
            Role::Seizer => self.seizer == *authority || self.master_authority == *authority,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Role {
    MasterAuthority,
    Pauser,
    Blacklister,
    Seizer,
}
