use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::SssError;

pub const ROLE_MINTER: u8 = 0;
pub const ROLE_BURNER: u8 = 1;
pub const ROLE_PAUSER: u8 = 2;
pub const ROLE_FREEZER: u8 = 3;
pub const ROLE_BLACKLISTER: u8 = 4;
pub const ROLE_SEIZER: u8 = 5;

pub fn update_roles_handler(
    ctx: Context<UpdateRoles>,
    _target: Pubkey,
    role: u8,
    active: bool,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;
    require!(
        ctx.accounts.authority.key() == config.authority,
        SssError::Unauthorized
    );

    let roles = &mut ctx.accounts.roles_config;
    roles.stablecoin = config.key();
    roles.target = ctx.accounts.target_wallet.key();

    // Set audit fields on first creation
    if roles.granted_by == Pubkey::default() {
        roles.granted_by = ctx.accounts.authority.key();
        roles.granted_at = clock.unix_timestamp;
    }
    roles.last_action_at = clock.unix_timestamp;
    roles.active = active;

    match role {
        ROLE_MINTER => roles.is_minter = active,
        ROLE_BURNER => roles.is_burner = active,
        ROLE_PAUSER => roles.is_pauser = active,
        ROLE_FREEZER => roles.is_freezer = active,
        ROLE_BLACKLISTER => {
            require!(config.is_sss2_or_higher(), SssError::FeatureNotEnabled);
            roles.is_blacklister = active;
        }
        ROLE_SEIZER => {
            require!(config.is_sss2_or_higher(), SssError::FeatureNotEnabled);
            roles.is_seizer = active;
        }
        _ => return Err(SssError::Unauthorized.into()),
    }

    if roles.bump == 0 {
        roles.bump = ctx.bumps.roles_config;
    }

    msg!("Role {} set to {} for {}", role, active, ctx.accounts.target_wallet.key());
    Ok(())
}

pub fn update_minter_config_handler(
    ctx: Context<UpdateMinterConfig>,
    _minter: Pubkey,
    quota: u64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        ctx.accounts.authority.key() == config.authority,
        SssError::Unauthorized
    );

    let roles = &mut ctx.accounts.roles_config;
    require!(roles.is_minter, SssError::Unauthorized);

    roles.mint_quota = quota;
    msg!("Minter quota updated to {} for {}", quota, roles.target);
    Ok(())
}

pub fn transfer_authority_handler(
    ctx: Context<TransferAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(
        ctx.accounts.authority.key() == config.authority,
        SssError::Unauthorized
    );

    config.authority = new_authority;
    msg!("Authority transferred to {}", new_authority);
    Ok(())
}

#[derive(Accounts)]
#[instruction(target: Pubkey)]
pub struct UpdateRoles<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: just the wallet address of the target
    pub target_wallet: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = RolesConfig::SPACE,
        seeds = [b"roles", config.key().as_ref(), target_wallet.key().as_ref()],
        bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(minter: Pubkey)]
pub struct UpdateMinterConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [b"roles", config.key().as_ref(), minter.as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

// =============================================================================
// TWO-STEP AUTHORITY TRANSFER (Circle FiatToken v2 Pattern)
// =============================================================================

/// Nominate a new authority - Step 1 of 2
/// The nominated authority must accept to complete the transfer
pub fn nominate_authority_handler(
    ctx: Context<NominateAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;
    
    require!(
        ctx.accounts.authority.key() == config.authority,
        SssError::Unauthorized
    );

    config.pending_authority = Some(new_authority);
    config.last_updated = clock.unix_timestamp;
    
    msg!("Authority nomination: {} nominated {}", config.authority, new_authority);
    Ok(())
}

/// Accept authority nomination - Step 2 of 2
/// Only the nominated authority can call this
pub fn accept_authority_handler(ctx: Context<AcceptAuthority>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;
    
    let pending = config.pending_authority
        .ok_or(SssError::NoPendingAuthority)?;
    
    require!(
        ctx.accounts.new_authority.key() == pending,
        SssError::Unauthorized
    );

    let old_authority = config.authority;
    config.authority = pending;
    config.pending_authority = None;
    config.last_updated = clock.unix_timestamp;
    
    msg!("Authority transfer complete: {} -> {}", old_authority, config.authority);
    Ok(())
}

/// Update supply cap at runtime
pub fn set_supply_cap_handler(
    ctx: Context<SetSupplyCap>,
    new_cap: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;
    
    require!(
        ctx.accounts.authority.key() == config.authority,
        SssError::Unauthorized
    );

    // New cap must be >= current supply
    let current_supply = config.current_supply();
    require!(
        new_cap >= current_supply,
        SssError::SupplyCapExceeded
    );

    let old_cap = config.supply_cap;
    config.supply_cap = new_cap;
    config.last_updated = clock.unix_timestamp;
    
    msg!("Supply cap updated: {} -> {}", old_cap, new_cap);
    Ok(())
}

#[derive(Accounts)]
pub struct NominateAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    pub new_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

#[derive(Accounts)]
pub struct SetSupplyCap<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}
