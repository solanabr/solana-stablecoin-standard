use anchor_lang::prelude::*;
use crate::{
    constants::*,
    error::SssError,
    events::BlacklistAdded,
    state::{BlacklistEntry, StablecoinConfig},
};

#[derive(Accounts)]
#[instruction(address: Pubkey, reason: String)]
pub struct AddToBlacklist<'info> {
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
        init,
        payer = blacklister,
        space = BlacklistEntry::SPACE,
        seeds = [BLACKLIST_SEED, config.mint.as_ref(), address.as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddToBlacklist>, address: Pubkey, reason: String) -> Result<()> {
    require!(reason.len() <= MAX_REASON_LEN, SssError::ReasonTooLong);

    let config = &ctx.accounts.config;
    let entry = &mut ctx.accounts.blacklist_entry;

    entry.mint = config.mint;
    entry.address = address;
    entry.reason = reason.clone();
    entry.timestamp = Clock::get()?.unix_timestamp;
    entry.blacklister = ctx.accounts.blacklister.key();
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(BlacklistAdded {
        mint: config.mint,
        address,
        reason,
        by: ctx.accounts.blacklister.key(),
    });

    Ok(())
}
