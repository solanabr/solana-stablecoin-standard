use anchor_lang::prelude::*;

/// Supported roles in the stablecoin system.
/// SSS-1: Minter, Burner, Pauser
/// SSS-2: adds Blacklister, Seizer (separated for compliance separation of duties)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Role {
    Minter,
    Burner,
    Pauser,
    /// Can add/remove addresses from the blacklist (SSS-2).
    Blacklister,
    /// Can seize tokens from blacklisted accounts via permanent delegate (SSS-2).
    Seizer,
}

/// Action to perform on a role assignment.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum RoleAction {
    Grant,
    Revoke,
}

/// Individual role assignment PDA.
/// Seeds: [b"role", config.key(), role_holder.key()]
#[account]
#[derive(Debug)]
pub struct RoleAssignment {
    pub bump: u8,
    pub config: Pubkey,
    pub holder: Pubkey,
    /// Bitmask of granted roles.
    /// bit 0 = Minter, 1 = Burner, 2 = Pauser, 3 = Blacklister, 4 = Seizer
    pub role_mask: u8,
    /// Optional mint quota for minters (0 = unlimited).
    pub mint_quota: u64,
    /// Amount minted by this role holder (for quota tracking).
    pub minted_amount: u64,
    /// Slot when this role was last updated.
    pub updated_at: u64,
}

impl RoleAssignment {
    pub const LEN: usize = 8  // discriminator
        + 1    // bump
        + 32   // config
        + 32   // holder
        + 1    // role_mask
        + 8    // mint_quota
        + 8    // minted_amount
        + 8;   // updated_at

    pub fn has_role(&self, role: Role) -> bool {
        let bit = Self::role_bit(role);
        self.role_mask & bit != 0
    }

    pub fn grant_role(&mut self, role: Role) {
        self.role_mask |= Self::role_bit(role);
    }

    pub fn revoke_role(&mut self, role: Role) {
        self.role_mask &= !Self::role_bit(role);
    }

    pub fn is_empty(&self) -> bool {
        self.role_mask == 0
    }

    fn role_bit(role: Role) -> u8 {
        match role {
            Role::Minter => 1 << 0,
            Role::Burner => 1 << 1,
            Role::Pauser => 1 << 2,
            Role::Blacklister => 1 << 3,
            Role::Seizer => 1 << 4,
        }
    }
}

/// Blacklist entry PDA for SSS-2 compliance.
/// Seeds: [b"blacklist", mint.key(), flagged_address.key()]
#[account]
#[derive(Debug)]
pub struct BlacklistEntry {
    pub bump: u8,
    pub mint: Pubkey,
    /// The blacklisted wallet address.
    pub address: Pubkey,
    /// Slot when this entry was created.
    pub created_at: u64,
    /// The compliance officer who added this entry.
    pub added_by: Pubkey,
    /// Reason for blacklisting (max 64 bytes, UTF-8).
    pub reason: [u8; 64],
}

impl BlacklistEntry {
    pub const LEN: usize = 8  // discriminator
        + 1    // bump
        + 32   // mint
        + 32   // address
        + 8    // created_at
        + 32   // added_by
        + 64;  // reason
}
