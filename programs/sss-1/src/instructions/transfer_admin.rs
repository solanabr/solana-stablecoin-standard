use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED, error::StablecoinError, events::AdminTransferred,
    state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.admin == admin.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: New admin pubkey can be any valid address
    pub new_admin: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<TransferAdmin>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let previous_admin = config.admin;
    let new_admin = ctx.accounts.new_admin.key();
    require!(
        new_admin != Pubkey::default(),
        StablecoinError::InvalidNewAuthority
    );
    require!(
        new_admin != previous_admin,
        StablecoinError::AuthorityUnchanged
    );
    config.admin = new_admin;

    emit!(AdminTransferred {
        config: config.key(),
        previous_admin,
        new_admin,
    });

    Ok(())
}
