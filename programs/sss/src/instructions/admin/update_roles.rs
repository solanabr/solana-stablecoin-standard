use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
#[instruction(authority_to_update: Pubkey)]
pub struct UpdateRoles<'info> {
    #[account(mut)]
    pub master_authority: Signer<'info>,

    #[account(
        has_one = master_authority @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init_if_needed,
        payer = master_authority,
        space = RoleRegistry::LEN,
        seeds = [b"role", config.key().as_ref(), authority_to_update.as_ref()],
        bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    pub system_program: Program<'info, System>,
}

pub fn update_roles_handler(
    ctx: Context<UpdateRoles>,
    authority_to_update: Pubkey,
    has_minter: bool,
    has_burner: bool,
    has_pauser: bool,
    has_blacklister: bool,
    has_seizer: bool,
    has_compliance_admin: bool,
) -> Result<()> {
    let registry = &mut ctx.accounts.role_registry;
    registry.config = ctx.accounts.config.key();
    registry.authority = authority_to_update;
    registry.has_minter = has_minter;
    registry.has_burner = has_burner;
    registry.has_pauser = has_pauser;
    registry.has_blacklister = has_blacklister;
    registry.has_seizer = has_seizer;
    registry.has_compliance_admin = has_compliance_admin;
    registry.bump = ctx.bumps.role_registry;

    Ok(())
}
