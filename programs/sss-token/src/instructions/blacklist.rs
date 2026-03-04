use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::state::*;

#[derive(Accounts)]
pub struct BlacklistManage<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, TokenConfig>,

    #[account(
        seeds = [b"sss_role", config.key().as_ref(), authority.key().as_ref()],
        bump = role.bump,
        constraint = role.config == config.key(),
        constraint = role.authority == authority.key(),
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(
        mut,
        seeds = [b"sss_blacklist", config.key().as_ref()],
        bump = blacklist.bump,
        constraint = blacklist.config == config.key(),
    )]
    pub blacklist: Account<'info, Blacklist>,
}

pub fn handler_add(ctx: Context<BlacklistManage>, address: Pubkey) -> Result<()> {
    let config = &ctx.accounts.config;
    let preset = config.preset_enum().ok_or(SssError::InvalidPreset)?;
    require!(preset.is_compliant(), SssError::PresetMismatch);
    require!(
        ctx.accounts.role.has_role(role_flags::BLACKLISTER),
        SssError::Unauthorized
    );

    let added = ctx.accounts.blacklist.add(address);
    require!(added, SssError::BlacklistFull);

    msg!("Added {} to blacklist", address);
    Ok(())
}

pub fn handler_remove(ctx: Context<BlacklistManage>, address: Pubkey) -> Result<()> {
    let config = &ctx.accounts.config;
    let preset = config.preset_enum().ok_or(SssError::InvalidPreset)?;
    require!(preset.is_compliant(), SssError::PresetMismatch);
    require!(
        ctx.accounts.role.has_role(role_flags::BLACKLISTER),
        SssError::Unauthorized
    );

    let removed = ctx.accounts.blacklist.remove(&address);
    require!(removed, SssError::NotBlacklisted);

    msg!("Removed {} from blacklist", address);
    Ok(())
}
