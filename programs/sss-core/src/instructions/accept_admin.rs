use anchor_lang::prelude::*;

use crate::error::SssError;
use crate::events::AdminTransferAccepted;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    #[account(
        constraint = pending_admin.key() == config.pending_admin @ SssError::NotPendingAdmin,
    )]
    pub pending_admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
        constraint = config.pending_admin != Pubkey::default() @ SssError::NoPendingAdmin,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handler(ctx: Context<AcceptAdmin>) -> Result<()> {
    require!(!ctx.accounts.config.paused, SssError::Paused);

    let config = &mut ctx.accounts.config;
    let previous_admin = config.admin;
    config.admin = config.pending_admin;
    config.pending_admin = Pubkey::default();

    emit!(AdminTransferAccepted {
        config: config.key(),
        previous_admin,
        new_admin: config.admin,
    });

    Ok(())
}
