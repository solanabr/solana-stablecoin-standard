use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::events::MetadataUpdated;
use crate::state::*;
use crate::utils::require_master_authority;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateMetadataParams {
    pub name: Option<String>,
    pub symbol: Option<String>,
    pub uri: Option<String>,
}

#[derive(Accounts)]
pub struct UpdateMetadata<'info> {
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
        constraint = role_registry.config == config.key() @ SssError::InvalidAuthority,
    )]
    pub role_registry: Account<'info, RoleRegistry>,
}

pub fn handler(ctx: Context<UpdateMetadata>, params: UpdateMetadataParams) -> Result<()> {
    require_master_authority(&ctx.accounts.role_registry, &ctx.accounts.authority.key())?;

    if let Some(ref name) = params.name {
        require!(
            !name.is_empty() && name.len() <= StablecoinConfig::MAX_NAME_LEN,
            SssError::NameTooLong
        );
    }
    if let Some(ref symbol) = params.symbol {
        require!(
            !symbol.is_empty() && symbol.len() <= StablecoinConfig::MAX_SYMBOL_LEN,
            SssError::SymbolTooLong
        );
    }
    if let Some(ref uri) = params.uri {
        require!(
            !uri.is_empty() && uri.len() <= StablecoinConfig::MAX_URI_LEN,
            SssError::UriTooLong
        );
    }

    let clock = Clock::get()?;
    let config = &mut ctx.accounts.config;

    if let Some(name) = params.name {
        config.name = name;
    }
    if let Some(symbol) = params.symbol {
        config.symbol = symbol;
    }
    if let Some(uri) = params.uri {
        config.uri = uri;
    }

    config.updated_at = clock.unix_timestamp;

    emit!(MetadataUpdated {
        config: config.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
