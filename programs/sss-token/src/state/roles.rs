use anchor_lang::prelude::*;

/// Bitmask roles. Multiple roles can be combined on a single authority.
///   ADMIN        = 1   — can assign/revoke roles, pause/unpause, update config
///   MINTER       = 2   — can mint tokens up to supply cap
///   BURNER       = 4   — can burn tokens from own account
///   FREEZER      = 8   — can freeze/thaw token accounts
///   BLACKLISTER  = 16  — can add/remove from blacklist (SSS-2 only)
///   SEIZER       = 32  — can seize tokens from blacklisted accounts (SSS-2 only)
pub mod role_flags {
    pub const ADMIN: u8 = 1;
    pub const MINTER: u8 = 2;
    pub const BURNER: u8 = 4;
    pub const FREEZER: u8 = 8;
    pub const BLACKLISTER: u8 = 16;
    pub const SEIZER: u8 = 32;
}

/// Per-authority role assignment. PDA seeds: [b"sss_role", config.key().as_ref(), authority.key().as_ref()]
#[account]
pub struct RoleAccount {
    pub bump: u8,
    /// The TokenConfig this role belongs to
    pub config: Pubkey,
    /// The wallet this role applies to
    pub authority: Pubkey,
    /// Bitmask of assigned roles
    pub roles: u8,
    pub _reserved: [u8; 32],
}

impl RoleAccount {
    pub const LEN: usize = 8 + 1 + 32 + 32 + 1 + 32;

    pub fn has_role(&self, flag: u8) -> bool {
        self.roles & flag != 0
    }

    pub fn grant(&mut self, flag: u8) {
        self.roles |= flag;
    }

    pub fn revoke(&mut self, flag: u8) {
        self.roles &= !flag;
    }
}
