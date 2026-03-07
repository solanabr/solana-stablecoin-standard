use anchor_lang::prelude::*;
use crate::{
    constants::*,
    error::SssError,
    events::BlacklistRemoved,
    state::{BlacklistEntry, StablecoinConfig},
};

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.preset == PRESET_SSS2 @ SssError::InvalidPreset,
        constraint = config.has_blacklist_authority(&blacklister.key()) @ SssError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        close = blacklister,
        seeds = [BLACKLIST_SEED, config.mint.as_ref(), address.as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn handler(ctx: Context<RemoveFromBlacklist>, address: Pubkey) -> Result<()> {
    let config = &ctx.accounts.config;

    emit!(BlacklistRemoved {
        mint: config.mint,
        address,
        by: ctx.accounts.blacklister.key(),
    });

    Ok(())
}
