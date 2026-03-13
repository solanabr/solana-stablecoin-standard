use anchor_lang::prelude::*;

use crate::{
    constants::HOOK_CONFIG_SEED, error::StablecoinError, events::ComplianceModeUpdated, state::HookConfig,
};

#[derive(Accounts)]
pub struct SetComplianceMode<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [HOOK_CONFIG_SEED, hook_config.mint.as_ref()],
        bump = hook_config.bump,
        constraint = hook_config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub hook_config: Account<'info, HookConfig>,
}

pub fn handler(ctx: Context<SetComplianceMode>, enabled: bool) -> Result<()> {
    let hook_config = &mut ctx.accounts.hook_config;
    hook_config.compliance_enabled = enabled;

    emit!(ComplianceModeUpdated {
        hook_config: hook_config.key(),
        updated_by: ctx.accounts.authority.key(),
        compliance_enabled: enabled,
    });

    Ok(())
}
