use anchor_lang::prelude::*;
use crate::constants::*;

/// Configuration provided at initialization time.
/// This determines which Token-2022 extensions get enabled on the mint.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StablecoinConfig {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    // SSS-2 compliance flags
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    /// If true, all new token accounts start frozen (SSS-2 typical setup).
    pub default_account_frozen: bool,
}

impl StablecoinConfig {
    pub fn preset_id(&self) -> u8 {
        if self.enable_permanent_delegate || self.enable_transfer_hook {
            2 // SSS-2
        } else {
            1 // SSS-1
        }
    }
}

/// Role types that can be assigned to external keypairs.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum RoleKind {
    Burner,
    Pauser,
    Blacklister,
    Seizer,
}

/// On-chain state for a deployed stablecoin.
#[account]
pub struct StablecoinState {
    /// The token mint created by this program.
    pub mint: Pubkey,
    /// Master authority — can assign roles, transfer authority, update metadata.
    pub authority: Pubkey,
    /// Freeze authority key (same as program PDA for the stablecoin).
    pub freeze_authority: Pubkey,
    /// Optional: permanent delegate (SSS-2 only). Held as a PDA.
    pub permanent_delegate: Option<Pubkey>,
    /// Which preset is active (1 = SSS-1, 2 = SSS-2).
    pub preset: u8,
    pub decimals: u8,
    pub paused: bool,
    pub enable_transfer_hook: bool,
    pub enable_permanent_delegate: bool,
    pub default_account_frozen: bool,
    /// Roles — stored inline for fast lookup (4 roles max in a Vec is fine).
    pub burners: Vec<Pubkey>,
    pub pausers: Vec<Pubkey>,
    pub blacklisters: Vec<Pubkey>,
    pub seizers: Vec<Pubkey>,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    /// PDA bump
    pub bump: u8,
}

impl StablecoinState {
    pub fn space(name: &str, symbol: &str, uri: &str) -> usize {
        8   // discriminator
        + 32 // mint
        + 32 // authority
        + 32 // freeze_authority
        + 1 + 32 // permanent_delegate Option<Pubkey>
        + 1  // preset
        + 1  // decimals
        + 1  // paused
        + 1  // enable_transfer_hook
        + 1  // enable_permanent_delegate
        + 1  // default_account_frozen
        + 4 + 32 * 5 // burners vec (up to 5)
        + 4 + 32 * 5 // pausers vec
        + 4 + 32 * 5 // blacklisters vec
        + 4 + 32 * 5 // seizers vec
        + 4 + name.len().min(MAX_NAME_LEN)
        + 4 + symbol.len().min(MAX_SYMBOL_LEN)
        + 4 + uri.len().min(MAX_URI_LEN)
        + 1  // bump
    }

    pub fn has_role(&self, key: &Pubkey, role: &RoleKind) -> bool {
        let list = match role {
            RoleKind::Burner => &self.burners,
            RoleKind::Pauser => &self.pausers,
            RoleKind::Blacklister => &self.blacklisters,
            RoleKind::Seizer => &self.seizers,
        };
        list.contains(key)
    }

    pub fn add_role(&mut self, key: Pubkey, role: &RoleKind) {
        let list = match role {
            RoleKind::Burner => &mut self.burners,
            RoleKind::Pauser => &mut self.pausers,
            RoleKind::Blacklister => &mut self.blacklisters,
            RoleKind::Seizer => &mut self.seizers,
        };
        if !list.contains(&key) {
            list.push(key);
        }
    }

    pub fn remove_role(&mut self, key: &Pubkey, role: &RoleKind) {
        let list = match role {
            RoleKind::Burner => &mut self.burners,
            RoleKind::Pauser => &mut self.pausers,
            RoleKind::Blacklister => &mut self.blacklisters,
            RoleKind::Seizer => &mut self.seizers,
        };
        list.retain(|k| k != key);
    }
}
