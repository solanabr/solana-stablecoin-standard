use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SssError;
use crate::events::ConfigUpdated;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct UpdateSupplyCap<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [SSS_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            admin.key().as_ref(),
            &[Role::Admin.as_u8()],
        ],
        bump = admin_role.bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,
}

pub fn handler_update_supply_cap(ctx: Context<UpdateSupplyCap>, new_supply_cap: Option<u64>) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(cap) = new_supply_cap {
        require!(cap >= config.current_supply(), SssError::InvalidSupplyCap);
    }

    config.supply_cap = new_supply_cap;

    emit!(ConfigUpdated {
        config: config.key(),
        field: "supply_cap".to_string(),
        updater: ctx.accounts.admin.key(),
    });

    Ok(())
}
