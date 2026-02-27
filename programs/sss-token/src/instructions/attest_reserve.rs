use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::state::*;
use crate::utils::require_master_authority;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AttestReserveParams {
    pub reserve_hash: [u8; 32],
    pub total_reserves_usd: u64,
    pub total_outstanding: u64,
    pub attestation_uri: String,
}

#[derive(Accounts)]
pub struct AttestReserve<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [RoleRegistry::SEED_PREFIX, config.key().as_ref()],
        bump = role_registry.bump,
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(
        init,
        payer = authority,
        space = ReserveAttestation::SPACE,
        seeds = [
            ReserveAttestation::SEED_PREFIX,
            config.key().as_ref(),
            config.reserve_attestation_index.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub attestation: Account<'info, ReserveAttestation>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AttestReserve>, params: AttestReserveParams) -> Result<()> {
    require_master_authority(&ctx.accounts.role_registry, &ctx.accounts.authority.key())?;

    require!(
        params.attestation_uri.len() <= ReserveAttestation::MAX_URI_LEN,
        SssError::UriTooLong
    );

    let clock = Clock::get()?;
    let config = &ctx.accounts.config;

    let attestation = &mut ctx.accounts.attestation;
    attestation.bump = ctx.bumps.attestation;
    attestation.config = config.key();
    attestation.index = config.reserve_attestation_index;
    attestation.reserve_hash = params.reserve_hash;
    attestation.total_reserves_usd = params.total_reserves_usd;
    attestation.total_outstanding = params.total_outstanding;
    attestation.attested_by = ctx.accounts.authority.key();
    attestation.attestation_uri = params.attestation_uri;
    attestation.timestamp = clock.unix_timestamp;

    // Increment attestation index
    let config = &mut ctx.accounts.config;
    config.reserve_attestation_index = config
        .reserve_attestation_index
        .checked_add(1)
        .ok_or(SssError::Overflow)?;
    config.updated_at = clock.unix_timestamp;

    Ok(())
}
