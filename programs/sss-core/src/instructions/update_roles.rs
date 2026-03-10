use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SSSError;
use crate::events::RoleUpdated;
use crate::state::{RoleType, StablecoinConfig};

#[derive(Accounts)]
pub struct UpdateRole<'info> {
    /// Only the authority can update roles.
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.authority @ SSSError::NotAuthority,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handle_update_role(
    ctx: Context<UpdateRole>,
    role: RoleType,
    new_address: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    // Prevent setting any role to the zero address (would permanently brick the role)
    require!(
        new_address != Pubkey::default(),
        SSSError::InvalidAuthority
    );

    // Blacklister role only available on SSS-2
    if role == RoleType::Blacklister {
        require!(
            config.preset >= PRESET_COMPLIANT,
            SSSError::PresetFeatureUnavailable
        );
    }

    let old_value = match &role {
        RoleType::MasterMinter => config.master_minter,
        RoleType::Pauser => config.pauser,
        RoleType::Blacklister => config.blacklister,
    };

    match &role {
        RoleType::MasterMinter => config.master_minter = new_address,
        RoleType::Pauser => config.pauser = new_address,
        RoleType::Blacklister => config.blacklister = new_address,
    }

    emit!(RoleUpdated {
        config: config.key(),
        role: role.to_string(),
        old_value,
        new_value: new_address,
        updated_by: ctx.accounts.authority.key(),
    });

    Ok(())
}
