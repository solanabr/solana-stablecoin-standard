use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::state::{Role, RoleRegistry, StablecoinConfig};

pub fn require_not_paused(config: &StablecoinConfig) -> Result<()> {
    require!(!config.is_paused, SssError::ProgramPaused);
    Ok(())
}

pub fn require_paused(config: &StablecoinConfig) -> Result<()> {
    require!(config.is_paused, SssError::ProgramNotPaused);
    Ok(())
}

pub fn require_role(roles: &RoleRegistry, authority: &Pubkey, role: Role) -> Result<()> {
    require!(roles.has_role(authority, role), SssError::Unauthorized);
    Ok(())
}

pub fn require_master_authority(roles: &RoleRegistry, authority: &Pubkey) -> Result<()> {
    require_role(roles, authority, Role::MasterAuthority)
}

pub fn require_freeze_authority(role_registry: &RoleRegistry, authority: &Pubkey) -> Result<()> {
    require!(
        *authority == role_registry.master_authority || *authority == role_registry.pauser,
        SssError::InvalidAuthority
    );
    Ok(())
}
