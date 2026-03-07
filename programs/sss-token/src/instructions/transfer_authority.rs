use anchor_lang::prelude::*;
use crate::{
    constants::*,
    error::SssError,
    events::AuthorityTransferred,
    state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
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

pub fn handler(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old_authority = config.authority;

    config.authority = new_authority;

    emit!(AuthorityTransferred {
        mint: config.mint,
        old_authority,
        new_authority,
    });

    Ok(())
}
