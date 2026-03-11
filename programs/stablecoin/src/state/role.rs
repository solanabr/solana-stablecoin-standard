use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Role {
    Owner,
    MasterMinter,
    Minter,
    Pauser,
    Blacklister,
}

impl Role {
    pub fn as_bytes(&self) -> &[u8] {
        match self {
            Role::Owner => b"owner",
            Role::MasterMinter => b"master_minter",
            Role::Minter => b"minter",
            Role::Pauser => b"pauser",
            Role::Blacklister => b"blacklister",
        }
    }
}

#[account]
#[derive(Debug)]
pub struct RoleAssignment {
    pub mint: Pubkey,
    pub role: Role,
    pub assignee: Pubkey,
    pub assigned_by: Pubkey,
    pub assigned_at: i64,
    pub bump: u8,
}

impl RoleAssignment {
    pub const SPACE: usize = 8 + 32 + 1 + 32 + 32 + 8 + 1;
}
