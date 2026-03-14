//! Transfer master authority instruction

use crate::{
    constants::CONFIG_SEED, error::StablecoinError, events::AuthorityTransferred,
    state::StablecoinConfig,
};
use anchor_lang::prelude::*;

/// Transfer master authority to a new address
pub fn handler(ctx: Context<TransferAuthority>, new_master: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require_master(config, &ctx.accounts.authority.key())?;

    let old_master = config.master_authority;
    config.master_authority = new_master;

    emit!(AuthorityTransferred {
        mint: config.mint,
        old_master,
        new_master,
    });

    Ok(())
}

fn require_master(config: &StablecoinConfig, signer: &Pubkey) -> Result<()> {
    require_keys_eq!(
        config.master_authority,
        *signer,
        StablecoinError::Unauthorized
    );
    Ok(())
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for seed derivation.
    pub mint: UncheckedAccount<'info>,
}
