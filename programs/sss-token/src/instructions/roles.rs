use anchor_lang::prelude::*;

use crate::{
    error::StablecoinError,
    events::{MinterUpdated, RoleUpdated},
    state::{MinterRole, RoleEntry, RoleType, StablecoinConfig, CONFIG_SEED, MINTER_SEED, ROLE_SEED},
};

// ─────────────────────────────────────────────────────────────────────────────
// AddMinter
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(quota: u64)]
pub struct AddMinterCtx<'info> {
    /// Master authority — only the master may register minters.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Config PDA — used to verify the caller is the master authority.
    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The address being granted minter privileges.
    /// CHECK: Arbitrary pubkey — we only store it, never execute as program.
    pub minter: UncheckedAccount<'info>,

    /// MinterRole PDA — created here.
    ///
    /// Seeds: [b"minter", mint, minter]
    #[account(
        init,
        payer = authority,
        space = 8 + MinterRole::INIT_SPACE,
        seeds = [MINTER_SEED, config.mint.as_ref(), minter.key().as_ref()],
        bump
    )]
    pub minter_role: Account<'info, MinterRole>,

    pub system_program: Program<'info, System>,
}

pub fn add_minter_handler(ctx: Context<AddMinterCtx>, quota: u64) -> Result<()> {
    let minter_role = &mut ctx.accounts.minter_role;
    minter_role.minter = ctx.accounts.minter.key();
    minter_role.mint = ctx.accounts.config.mint;
    minter_role.quota = quota;
    minter_role.minted = 0;
    minter_role.active = true;
    minter_role.bump = ctx.bumps.minter_role;

    emit!(MinterUpdated {
        mint: ctx.accounts.config.mint,
        minter: ctx.accounts.minter.key(),
        active: true,
        quota,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// RemoveMinter
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RemoveMinterCtx<'info> {
    /// Master authority only.
    pub authority: Signer<'info>,

    /// Config PDA.
    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The minter address being deactivated.
    /// CHECK: Arbitrary pubkey used only as a seed reference.
    pub minter: UncheckedAccount<'info>,

    /// MinterRole PDA to deactivate.
    #[account(
        mut,
        seeds = [MINTER_SEED, config.mint.as_ref(), minter.key().as_ref()],
        bump = minter_role.bump,
        constraint = minter_role.mint == config.mint @ StablecoinError::Unauthorized,
        constraint = minter_role.minter == minter.key() @ StablecoinError::Unauthorized,
    )]
    pub minter_role: Account<'info, MinterRole>,
}

pub fn remove_minter_handler(ctx: Context<RemoveMinterCtx>) -> Result<()> {
    let minter_role = &mut ctx.accounts.minter_role;
    minter_role.active = false;

    emit!(MinterUpdated {
        mint: ctx.accounts.config.mint,
        minter: ctx.accounts.minter.key(),
        active: false,
        quota: minter_role.quota,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// AddRole
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(role: RoleType, address: Pubkey)]
pub struct AddRoleCtx<'info> {
    /// Master authority only.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Config PDA.
    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// RoleEntry PDA — created here.
    ///
    /// Seeds: [b"role", mint, role_byte, address]
    #[account(
        init,
        payer = authority,
        space = 8 + RoleEntry::INIT_SPACE,
        seeds = [ROLE_SEED, config.mint.as_ref(), &[role as u8], address.as_ref()],
        bump
    )]
    pub role_entry: Account<'info, RoleEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_role_handler(
    ctx: Context<AddRoleCtx>,
    role: RoleType,
    address: Pubkey,
) -> Result<()> {
    let role_entry = &mut ctx.accounts.role_entry;
    role_entry.address = address;
    role_entry.mint = ctx.accounts.config.mint;
    role_entry.role = role;
    role_entry.active = true;
    role_entry.bump = ctx.bumps.role_entry;

    emit!(RoleUpdated {
        mint: ctx.accounts.config.mint,
        address,
        role: role as u8,
        active: true,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// RemoveRole
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(role: RoleType, address: Pubkey)]
pub struct RemoveRoleCtx<'info> {
    /// Master authority only.
    pub authority: Signer<'info>,

    /// Config PDA.
    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// RoleEntry PDA to deactivate.
    #[account(
        mut,
        seeds = [ROLE_SEED, config.mint.as_ref(), &[role as u8], address.as_ref()],
        bump = role_entry.bump,
        constraint = role_entry.mint == config.mint @ StablecoinError::Unauthorized,
        constraint = role_entry.address == address @ StablecoinError::Unauthorized,
    )]
    pub role_entry: Account<'info, RoleEntry>,
}

pub fn remove_role_handler(
    ctx: Context<RemoveRoleCtx>,
    role: RoleType,
    address: Pubkey,
) -> Result<()> {
    let role_entry = &mut ctx.accounts.role_entry;
    role_entry.active = false;

    emit!(RoleUpdated {
        mint: ctx.accounts.config.mint,
        address,
        role: role as u8,
        active: false,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
