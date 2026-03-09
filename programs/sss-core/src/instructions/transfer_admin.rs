use anchor_lang::prelude::*;

use crate::error::SssError;
use crate::events::AdminTransferInitiated;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(
        constraint = admin.key() == config.admin @ SssError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handler(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
    require!(new_admin != Pubkey::default(), SssError::InvalidInput);
    // No pause check: admin governance must work even when paused to prevent bricking

    let config = &mut ctx.accounts.config;
    config.pending_admin = new_admin;

    emit!(AdminTransferInitiated {
        config: config.key(),
        current_admin: config.admin,
        pending_admin: new_admin,
    });

    Ok(())
}
