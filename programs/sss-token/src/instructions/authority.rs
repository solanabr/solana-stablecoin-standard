use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::SSSError,
    events::AuthorityTransferred,
    state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
        has_one = authority @ SSSError::Unauthorized,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,
}

pub fn handler(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.stablecoin_config;
    let previous_authority = config.authority;
    let mint_key = config.mint;

    config.authority = new_authority;

    emit!(AuthorityTransferred {
        mint: mint_key,
        previous_authority,
        new_authority,
    });

    Ok(())
}
