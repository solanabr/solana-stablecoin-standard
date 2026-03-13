use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SSSError;
use crate::events::{RoleUpdated, MinterUpdated, AuthorityNominated, AuthorityAccepted, SupplyCapUpdated};
use crate::state::*;

/// Update roles for a given account. Only the master authority can do this.
#[derive(Accounts)]
#[instruction(target: Pubkey)]
pub struct UpdateRoles<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
        constraint = stablecoin_config.authority == authority.key() @ SSSError::Unauthorized,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAccount::LEN,
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref(), target.as_ref()],
        bump,
    )]
    pub target_roles: Account<'info, RoleAccount>,

    pub system_program: Program<'info, System>,
}

pub fn update_roles_handler(
    ctx: Context<UpdateRoles>,
    target: Pubkey,
    role_flag: u16,
    grant: bool,
) -> Result<()> {
    let clock = Clock::get()?;
    let roles = &mut ctx.accounts.target_roles;

    if roles.stablecoin == Pubkey::default() {
        roles.stablecoin = ctx.accounts.stablecoin_config.key();
        roles.holder = target;
        roles.bump = ctx.bumps.target_roles;
    }

    if grant {
        roles.roles |= role_flag;
        roles.active = true;
    } else {
        roles.roles &= !role_flag;
        if roles.roles == 0 {
            roles.active = false;
        }
    }

    roles.granted_by = ctx.accounts.authority.key();
    roles.last_modified = clock.unix_timestamp;

    emit!(RoleUpdated {
        mint: ctx.accounts.stablecoin_config.mint,
        account: target,
        role: Role::name(role_flag).to_string(),
        granted: grant,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

/// Update (add/remove/modify) a minter with quota.
#[derive(Accounts)]
#[instruction(minter_key: Pubkey)]
pub struct UpdateMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
        constraint = stablecoin_config.authority == authority.key() @ SSSError::Unauthorized,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = MinterConfig::LEN,
        seeds = [MINTER_SEED, stablecoin_config.key().as_ref(), minter_key.as_ref()],
        bump,
    )]
    pub minter_config: Account<'info, MinterConfig>,

    pub system_program: Program<'info, System>,
}

pub fn update_minter_handler(
    ctx: Context<UpdateMinter>,
    minter_key: Pubkey,
    quota: u64,
    active: bool,
) -> Result<()> {
    let minter = &mut ctx.accounts.minter_config;

    if minter.stablecoin == Pubkey::default() {
        minter.stablecoin = ctx.accounts.stablecoin_config.key();
        minter.minter = minter_key;
        minter.minted = 0;
        minter.bump = ctx.bumps.minter_config;
    }

    minter.quota = quota;
    minter.active = active;

    let clock = Clock::get()?;
    emit!(MinterUpdated {
        mint: ctx.accounts.stablecoin_config.mint,
        minter: minter_key,
        quota,
        active,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

/// Two-step authority transfer: Step 1 — Nominate a new authority.
#[derive(Accounts)]
pub struct NominateAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
        constraint = stablecoin_config.authority == authority.key() @ SSSError::Unauthorized,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,
}

pub fn nominate_authority_handler(
    ctx: Context<NominateAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.stablecoin_config;
    config.pending_authority = Some(new_authority);

    let clock = Clock::get()?;
    emit!(AuthorityNominated {
        mint: config.mint,
        current_authority: ctx.accounts.authority.key(),
        pending_authority: new_authority,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

/// Two-step authority transfer: Step 2 — Accept authority.
#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    pub new_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,
}

pub fn accept_authority_handler(ctx: Context<AcceptAuthority>) -> Result<()> {
    let config = &mut ctx.accounts.stablecoin_config;

    let pending = config.pending_authority.ok_or(SSSError::NoPendingAuthority)?;
    require!(
        pending == ctx.accounts.new_authority.key(),
        SSSError::NotPendingAuthority
    );

    let old_authority = config.authority;
    config.authority = pending;
    config.pending_authority = None;

    let clock = Clock::get()?;
    emit!(AuthorityAccepted {
        mint: config.mint,
        old_authority,
        new_authority: pending,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

/// Update the supply cap. Only master authority.
#[derive(Accounts)]
pub struct UpdateSupplyCap<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
        constraint = stablecoin_config.authority == authority.key() @ SSSError::Unauthorized,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,
}

pub fn update_supply_cap_handler(
    ctx: Context<UpdateSupplyCap>,
    new_cap: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.stablecoin_config;

    if new_cap > 0 {
        require!(
            new_cap >= config.current_supply(),
            SSSError::InvalidSupplyCap
        );
    }

    let old_cap = config.supply_cap;
    config.supply_cap = new_cap;

    let clock = Clock::get()?;
    emit!(SupplyCapUpdated {
        mint: config.mint,
        old_cap,
        new_cap,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
