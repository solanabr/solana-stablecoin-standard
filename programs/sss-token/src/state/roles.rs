use anchor_lang::prelude::*;

/// Maximum number of minters allowed per stablecoin.
pub const MAX_MINTERS: usize = 16;
/// Maximum number of burners allowed per stablecoin.
pub const MAX_BURNERS: usize = 16;

/// Role-based access control account for a stablecoin.
///
/// Stores all role assignments and minter quotas. Linked to a
/// StablecoinConfig account.
///
/// PDA seeds: `[b"roles", config.key()]`
#[account]
pub struct RoleManager {
    /// The StablecoinConfig this role manager belongs to
    pub config: Pubkey,
    /// Master authority — can update all roles
    pub master_authority: Pubkey,
    /// Address authorized to pause/unpause operations
    pub pauser: Pubkey,
    /// Authorized minters with per-minter quotas
    pub minters: Vec<MinterEntry>,
    /// Authorized burner addresses
    pub burners: Vec<Pubkey>,
    /// SSS-2: Address authorized to manage the blacklist
    pub blacklister: Pubkey,
    /// SSS-2: Address authorized to seize tokens
    pub seizer: Pubkey,
    /// PDA bump seed
    pub bump: u8,
}

impl RoleManager {
    /// Calculate the space needed for the account.
    pub const fn space() -> usize {
        8 +     // discriminator
        32 +    // config
        32 +    // master_authority
        32 +    // pauser
        (4 + MAX_MINTERS * MinterEntry::SIZE) + // minters vec
        (4 + MAX_BURNERS * 32) +                // burners vec
        32 +    // blacklister
        32 +    // seizer
        1 // bump
    }

    /// Check if an address is an authorized minter and has quota remaining.
    pub fn find_minter(&self, address: &Pubkey) -> Option<&MinterEntry> {
        self.minters.iter().find(|m| m.address == *address)
    }

    /// Check if an address is an authorized minter (mutable ref for updating).
    pub fn find_minter_mut(&mut self, address: &Pubkey) -> Option<&mut MinterEntry> {
        self.minters.iter_mut().find(|m| m.address == *address)
    }

    /// Check if an address is an authorized burner.
    pub fn is_burner(&self, address: &Pubkey) -> bool {
        self.burners.iter().any(|b| b == address)
    }
}

/// A minter entry with address and quota tracking.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct MinterEntry {
    /// Minter's public key
    pub address: Pubkey,
    /// Maximum amount this minter is allowed to mint
    pub quota: u64,
    /// Amount already minted by this minter
    pub minted: u64,
}

impl MinterEntry {
    /// Size of a serialized MinterEntry
    pub const SIZE: usize = 32 + 8 + 8; // address + quota + minted

    /// Returns the remaining quota for this minter.
    pub fn remaining_quota(&self) -> u64 {
        self.quota.saturating_sub(self.minted)
    }
}
