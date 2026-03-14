//! Blacklist management instructions (SSS-2)

use crate::{
    compliance,
    constants::{COMPLIANCE_RECORD_SEED, CONFIG_SEED},
    error::StablecoinError,
    events::BlacklistUpdated,
    state::{ComplianceRecord, StablecoinConfig},
};
use anchor_lang::prelude::*;

/// Add a wallet to the blacklist
pub fn add_handler(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        config.compliance_enabled,
        StablecoinError::ComplianceDisabled
    );
    require!(
        is_blacklister(config, &ctx.accounts.authority.key()),
        StablecoinError::Unauthorized
    );

    let record = &mut ctx.accounts.compliance_record;
    record.bump = ctx.bumps.compliance_record;
    record.mint = ctx.accounts.mint.key();
    record.wallet = ctx.accounts.wallet.key();
    record.blacklisted = true;
    record.reason_hash = compliance::hash_reason(&reason);
    record.updated_at = Clock::get()?.unix_timestamp;

    emit!(BlacklistUpdated {
        mint: record.mint,
        wallet: record.wallet,
        blacklisted: true,
        authority: ctx.accounts.authority.key(),
        reason_hash: record.reason_hash,
    });

    Ok(())
}

/// Remove a wallet from the blacklist
pub fn remove_handler(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        config.compliance_enabled,
        StablecoinError::ComplianceDisabled
    );
    require!(
        is_blacklister(config, &ctx.accounts.authority.key()),
        StablecoinError::Unauthorized
    );

    let record = &mut ctx.accounts.compliance_record;
    record.bump = ctx.bumps.compliance_record;
    record.mint = ctx.accounts.mint.key();
    record.wallet = ctx.accounts.wallet.key();
    record.blacklisted = false;
    record.reason_hash = [0u8; 32];
    record.updated_at = Clock::get()?.unix_timestamp;

    emit!(BlacklistUpdated {
        mint: record.mint,
        wallet: record.wallet,
        blacklisted: false,
        authority: ctx.accounts.authority.key(),
        reason_hash: record.reason_hash,
    });

    Ok(())
}

fn is_blacklister(config: &StablecoinConfig, signer: &Pubkey) -> bool {
    *signer == config.master_authority || *signer == config.blacklister
}

#[derive(Accounts)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for seed derivation.
    pub mint: UncheckedAccount<'info>,

    /// CHECK: wallet under compliance review.
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + ComplianceRecord::INIT_SPACE,
        seeds = [COMPLIANCE_RECORD_SEED, mint.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub compliance_record: Account<'info, ComplianceRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for seed derivation.
    pub mint: UncheckedAccount<'info>,

    /// CHECK: wallet under compliance review.
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + ComplianceRecord::INIT_SPACE,
        seeds = [COMPLIANCE_RECORD_SEED, mint.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub compliance_record: Account<'info, ComplianceRecord>,

    pub system_program: Program<'info, System>,
}
