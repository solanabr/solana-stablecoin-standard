use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::events::RoleUpdated;
use crate::state::*;
use crate::utils::require_master_authority;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateRoleParams {
    pub role: Role,
    pub new_holder: Pubkey,
}

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [RoleRegistry::SEED_PREFIX, config.key().as_ref()],
        bump = role_registry.bump,
    )]
    pub role_registry: Account<'info, RoleRegistry>,
}

pub fn handler(ctx: Context<UpdateRoles>, params: UpdateRoleParams) -> Result<()> {
    require_master_authority(&ctx.accounts.role_registry, &ctx.accounts.authority.key())?;

    let clock = Clock::get()?;
    let role_registry = &mut ctx.accounts.role_registry;

    let role_name: String;
    let old_holder: Pubkey;

    match params.role {
        Role::MasterAuthority => {
            return Err(SssError::InvalidAuthority.into());
            // Use transfer_authority instruction instead
        }
        Role::Pauser => {
            role_name = "pauser".to_string();
            old_holder = role_registry.pauser;
            role_registry.pauser = params.new_holder;
        }
        Role::Blacklister => {
            require!(
                ctx.accounts.config.enable_permanent_delegate,
                SssError::FeatureNotEnabled
            );
            role_name = "blacklister".to_string();
            old_holder = role_registry.blacklister;
            role_registry.blacklister = params.new_holder;
        }
        Role::Seizer => {
            require!(
                ctx.accounts.config.enable_permanent_delegate,
                SssError::FeatureNotEnabled
            );
            role_name = "seizer".to_string();
            old_holder = role_registry.seizer;
            role_registry.seizer = params.new_holder;
        }
    }

    ctx.accounts.config.updated_at = clock.unix_timestamp;

    emit!(RoleUpdated {
        config: ctx.accounts.config.key(),
        role: role_name,
        old_holder,
        new_holder: params.new_holder,
        updated_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
