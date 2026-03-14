use anchor_lang::prelude::*;

/// Roles available in the stablecoin system
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum Role {
    Admin,
    Minter,
    Pauser,
    Freezer,
    Blacklister,
    Seizer,
}

impl Role {
    pub fn to_byte(&self) -> u8 {
        match self {
            Role::Admin => 0,
            Role::Minter => 1,
            Role::Pauser => 2,
            Role::Freezer => 3,
            Role::Blacklister => 4,
            Role::Seizer => 5,
        }
    }

    pub fn from_byte(byte: u8) -> Option<Role> {
        match byte {
            0 => Some(Role::Admin),
            1 => Some(Role::Minter),
            2 => Some(Role::Pauser),
            3 => Some(Role::Freezer),
            4 => Some(Role::Blacklister),
            5 => Some(Role::Seizer),
            _ => None,
        }
    }
}

/// Blacklist entry account data (mirrors sss-core state)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct BlacklistEntryData {
    pub config: Pubkey,
    pub address: Pubkey,
    pub bump: u8,
}

/// Role assignment account data (mirrors sss-core state)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RoleAssignmentData {
    pub config: Pubkey,
    pub holder: Pubkey,
    pub role: u8,
    pub bump: u8,
}
