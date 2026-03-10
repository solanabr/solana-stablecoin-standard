use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SSSError;
use crate::events::AuthorityTransferAccepted;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    /// The pending authority accepting the transfer.
    pub new_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.pending_authority != Pubkey::default() @ SSSError::NoPendingAuthority,
        constraint = new_authority.key() == config.pending_authority @ SSSError::NotPendingAuthority,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handle_accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old_authority = config.authority;

    config.authority = ctx.accounts.new_authority.key();
    config.pending_authority = Pubkey::default();

    emit!(AuthorityTransferAccepted {
        config: config.key(),
        old_authority,
        new_authority: ctx.accounts.new_authority.key(),
    });

    Ok(())
}
