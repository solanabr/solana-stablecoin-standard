use anchor_lang::prelude::*;
use crate::{
    constants::*,
    error::SssError,
    events::RolesUpdated,
    state::StablecoinConfig,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateRolesParams {
    pub burner: Option<Pubkey>,
    pub pauser: Option<Pubkey>,
    /// SSS-2 only — no-op for SSS-1
    pub blacklister: Option<Pubkey>,
    /// SSS-2 only — no-op for SSS-1
    pub seizer: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    #[account(
        constraint = config.authority == authority.key() @ SssError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handler(ctx: Context<UpdateRoles>, params: UpdateRolesParams) -> Result<()> {
    let config = &mut ctx.accounts.config;

    config.burner = params.burner;
    config.pauser = params.pauser;

    // SSS-2 roles — safe to set even on SSS-1 (won't be used without enable flags)
    config.blacklister = params.blacklister;
    config.seizer = params.seizer;

    emit!(RolesUpdated {
        mint: config.mint,
        by: ctx.accounts.authority.key(),
    });

    Ok(())
}
