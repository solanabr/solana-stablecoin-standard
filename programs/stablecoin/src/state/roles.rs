use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum RoleType {
    Minter,
    Burner,
    Blacklister,
    Pauser,
    Seizer,
}

impl RoleType {
    pub fn discriminator(&self) -> u8 {
        match self {
            Self::Minter => 0,
            Self::Burner => 1,
            Self::Blacklister => 2,
            Self::Pauser => 3,
            Self::Seizer => 4,
        }
    }
}

#[account]
pub struct RoleAssignment {
    pub mint: Pubkey,
    pub holder: Pubkey,
    pub role: RoleType,
    pub is_active: bool,
    pub mint_quota: Option<u64>,
    pub minted_so_far: u64,
    pub bump: u8,
}

impl RoleAssignment {
    pub const LEN: usize = 8 + 32 + 32 + 2 + 1 + 9 + 8 + 1;

    pub fn check_mint_quota(&self, amount: u64) -> bool {
        match self.mint_quota {
            Some(quota) => self.minted_so_far.saturating_add(amount) <= quota,
            None => true,
        }
    }
}
