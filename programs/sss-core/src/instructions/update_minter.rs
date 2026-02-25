use anchor_lang::prelude::*;

use crate::constants::*;
use crate::events::ConfigUpdated;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct UpdateMinter<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [SSS_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Admin role PDA — proves admin authorization.
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

    /// The minter's role account to update. Must be a Minter role.
    #[account(
        mut,
        constraint = minter_role.config == config.key(),
        constraint = minter_role.role == Role::Minter,
    )]
    pub minter_role: Account<'info, RoleAccount>,
}

pub fn handler_update_minter(
    ctx: Context<UpdateMinter>,
    new_quota: Option<u64>,
) -> Result<()> {
    ctx.accounts.minter_role.mint_quota = new_quota;

    emit!(ConfigUpdated {
        config: ctx.accounts.config.key(),
        field: "minter_quota".to_string(),
        updater: ctx.accounts.admin.key(),
    });

    Ok(())
}
