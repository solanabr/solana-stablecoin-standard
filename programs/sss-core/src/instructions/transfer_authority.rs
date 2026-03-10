use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SSSError;
use crate::events::AuthorityTransferInitiated;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.authority @ SSSError::NotAuthority,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handle_transfer_authority(
    ctx: Context<TransferAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.pending_authority = new_authority;

    emit!(AuthorityTransferInitiated {
        config: config.key(),
        current_authority: ctx.accounts.authority.key(),
        pending_authority: new_authority,
    });

    Ok(())
}
