use anchor_lang::prelude::*;

use crate::error::StablecoinError;
use crate::events::RolesUpdated;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateRolesParams {
    pub pauser: Option<Pubkey>,
    pub freezer: Option<Pubkey>,
    pub blacklister: Option<Pubkey>,
    pub seizer: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    /// The master authority.
    pub authority: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        seeds = [StablecoinConfig::SEED_PREFIX, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.master_authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Box<Account<'info, StablecoinConfig>>,

    /// Role configuration PDA.
    #[account(
        mut,
        seeds = [RoleConfig::SEED_PREFIX, config.key().as_ref()],
        bump = roles.bump,
    )]
    pub roles: Account<'info, RoleConfig>,
}

pub fn handler(ctx: Context<UpdateRoles>, params: UpdateRolesParams) -> Result<()> {
    let roles = &mut ctx.accounts.roles;

    if let Some(pauser) = params.pauser {
        roles.pauser = pauser;
    }
    if let Some(freezer) = params.freezer {
        roles.freezer = freezer;
    }
    if let Some(blacklister) = params.blacklister {
        roles.blacklister = blacklister;
    }
    if let Some(seizer) = params.seizer {
        roles.seizer = seizer;
    }

    emit!(RolesUpdated {
        config: ctx.accounts.config.key(),
        updated_by: ctx.accounts.authority.key(),
        new_pauser: params.pauser,
        new_freezer: params.freezer,
        new_blacklister: params.blacklister,
        new_seizer: params.seizer,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
