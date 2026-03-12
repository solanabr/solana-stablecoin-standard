use anchor_lang::prelude::*;

use crate::state::{StablecoinConfig, RoleManager, MinterEntry};
use crate::state::roles::{MAX_MINTERS, MAX_BURNERS};
use crate::errors::SssError;

/// Parameters for updating role assignments.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateRolesParams {
    pub new_pauser: Option<Pubkey>,
    pub new_blacklister: Option<Pubkey>,
    pub new_seizer: Option<Pubkey>,
    pub add_burner: Option<Pubkey>,
    pub remove_burner: Option<Pubkey>,
}

/// Accounts for the update_minter instruction.
#[derive(Accounts)]
pub struct UpdateMinter<'info> {
    /// The master authority.
    pub authority: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager.
    #[account(
        mut,
        seeds = [b"roles", config.key().as_ref()],
        bump = role_manager.bump,
        has_one = config,
    )]
    pub role_manager: Account<'info, RoleManager>,
}

/// Accounts for the remove_minter instruction.
#[derive(Accounts)]
pub struct RemoveMinter<'info> {
    /// The master authority.
    pub authority: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager.
    #[account(
        mut,
        seeds = [b"roles", config.key().as_ref()],
        bump = role_manager.bump,
        has_one = config,
    )]
    pub role_manager: Account<'info, RoleManager>,
}

/// Accounts for the update_roles instruction.
#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    /// The master authority.
    pub authority: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager.
    #[account(
        mut,
        seeds = [b"roles", config.key().as_ref()],
        bump = role_manager.bump,
        has_one = config,
    )]
    pub role_manager: Account<'info, RoleManager>,
}

/// Accounts for the transfer_authority instruction.
#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    /// The current master authority.
    pub authority: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager.
    #[account(
        mut,
        seeds = [b"roles", config.key().as_ref()],
        bump = role_manager.bump,
        has_one = config,
    )]
    pub role_manager: Account<'info, RoleManager>,
}

/// Event emitted when a minter is added or updated.
#[event]
pub struct MinterUpdated {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub quota: u64,
    pub updated_by: Pubkey,
}

/// Event emitted when a minter is removed.
#[event]
pub struct MinterRemoved {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub removed_by: Pubkey,
}

/// Event emitted when roles are updated.
#[event]
pub struct RolesUpdated {
    pub config: Pubkey,
    pub updated_by: Pubkey,
}

/// Event emitted when authority is transferred.
#[event]
pub struct AuthorityTransferred {
    pub config: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

pub fn update_minter_handler(
    ctx: Context<UpdateMinter>,
    minter: Pubkey,
    quota: u64,
) -> Result<()> {
    let role_manager = &mut ctx.accounts.role_manager;
    let authority_key = ctx.accounts.authority.key();

    require!(
        authority_key == role_manager.master_authority,
        SssError::UnauthorizedMasterAuthority
    );

    // Try to update existing minter
    if let Some(entry) = role_manager.find_minter_mut(&minter) {
        entry.quota = quota;
    } else {
        // Add new minter
        require!(role_manager.minters.len() < MAX_MINTERS, SssError::MaxMintersReached);
        role_manager.minters.push(MinterEntry {
            address: minter,
            quota,
            minted: 0,
        });
    }

    emit!(MinterUpdated {
        config: ctx.accounts.config.key(),
        minter,
        quota,
        updated_by: authority_key,
    });

    Ok(())
}

pub fn remove_minter_handler(
    ctx: Context<RemoveMinter>,
    minter: Pubkey,
) -> Result<()> {
    let role_manager = &mut ctx.accounts.role_manager;
    let authority_key = ctx.accounts.authority.key();

    require!(
        authority_key == role_manager.master_authority,
        SssError::UnauthorizedMasterAuthority
    );

    let index = role_manager
        .minters
        .iter()
        .position(|m| m.address == minter)
        .ok_or(SssError::MinterNotFound)?;

    role_manager.minters.remove(index);

    emit!(MinterRemoved {
        config: ctx.accounts.config.key(),
        minter,
        removed_by: authority_key,
    });

    Ok(())
}

pub fn update_roles_handler(
    ctx: Context<UpdateRoles>,
    params: UpdateRolesParams,
) -> Result<()> {
    let role_manager = &mut ctx.accounts.role_manager;
    let authority_key = ctx.accounts.authority.key();

    require!(
        authority_key == role_manager.master_authority,
        SssError::UnauthorizedMasterAuthority
    );

    if let Some(pauser) = params.new_pauser {
        role_manager.pauser = pauser;
    }

    if let Some(blacklister) = params.new_blacklister {
        role_manager.blacklister = blacklister;
    }

    if let Some(seizer) = params.new_seizer {
        role_manager.seizer = seizer;
    }

    if let Some(burner) = params.add_burner {
        if !role_manager.is_burner(&burner) {
            require!(role_manager.burners.len() < MAX_BURNERS, SssError::MaxBurnersReached);
            role_manager.burners.push(burner);
        }
    }

    if let Some(burner) = params.remove_burner {
        role_manager.burners.retain(|b| *b != burner);
    }

    emit!(RolesUpdated {
        config: ctx.accounts.config.key(),
        updated_by: authority_key,
    });

    Ok(())
}

pub fn transfer_authority_handler(
    ctx: Context<TransferAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_manager = &mut ctx.accounts.role_manager;
    let authority_key = ctx.accounts.authority.key();

    require!(
        authority_key == role_manager.master_authority,
        SssError::UnauthorizedMasterAuthority
    );

    let old_authority = config.authority;
    config.authority = new_authority;
    role_manager.master_authority = new_authority;

    emit!(AuthorityTransferred {
        config: config.key(),
        old_authority,
        new_authority,
    });

    Ok(())
}
