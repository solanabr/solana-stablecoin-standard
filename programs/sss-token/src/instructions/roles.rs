use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::SSSError,
    events::{MinterQuotaUpdated, RoleUpdated},
    state::{MinterInfo, RoleManager, StablecoinConfig},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum RoleType {
    Minter,
    Burner,
    Pauser,
    Blacklister,
    Seizer,
}

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
        has_one = authority @ SSSError::Unauthorized,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref()],
        bump = role_manager.bump,
    )]
    pub role_manager: Account<'info, RoleManager>,
}

pub fn add_role_handler(
    ctx: Context<UpdateRoles>,
    role: RoleType,
    address: Pubkey,
) -> Result<()> {
    let roles = &mut ctx.accounts.role_manager;
    let mint_key = ctx.accounts.stablecoin_config.mint;
    let config = &ctx.accounts.stablecoin_config;

    match role {
        RoleType::Minter => {
            return err!(SSSError::UseDedicatedAddMinter);
        }
        RoleType::Burner => {
            require!(!roles.burners.contains(&address), SSSError::AlreadyHasRole);
            require!(roles.burners.len() < MAX_BURNERS, SSSError::RoleCapacityReached);
            roles.burners.push(address);
        }
        RoleType::Pauser => {
            require!(!roles.pausers.contains(&address), SSSError::AlreadyHasRole);
            require!(roles.pausers.len() < MAX_PAUSERS, SSSError::RoleCapacityReached);
            roles.pausers.push(address);
        }
        RoleType::Blacklister => {
            require!(config.enable_permanent_delegate, SSSError::ComplianceNotEnabled);
            require!(!roles.blacklisters.contains(&address), SSSError::AlreadyHasRole);
            require!(roles.blacklisters.len() < MAX_BLACKLISTERS, SSSError::RoleCapacityReached);
            roles.blacklisters.push(address);
        }
        RoleType::Seizer => {
            require!(config.enable_permanent_delegate, SSSError::ComplianceNotEnabled);
            require!(!roles.seizers.contains(&address), SSSError::AlreadyHasRole);
            require!(roles.seizers.len() < MAX_SEIZERS, SSSError::RoleCapacityReached);
            roles.seizers.push(address);
        }
    }

    emit!(RoleUpdated {
        mint: mint_key,
        role: role_name(&role),
        address,
        action: "added".to_string(),
    });

    Ok(())
}

pub fn remove_role_handler(
    ctx: Context<UpdateRoles>,
    role: RoleType,
    address: Pubkey,
) -> Result<()> {
    let roles = &mut ctx.accounts.role_manager;
    let mint_key = ctx.accounts.stablecoin_config.mint;

    let list = match role {
        RoleType::Minter => &mut roles.minters,
        RoleType::Burner => &mut roles.burners,
        RoleType::Pauser => &mut roles.pausers,
        RoleType::Blacklister => &mut roles.blacklisters,
        RoleType::Seizer => &mut roles.seizers,
    };

    let pos = list.iter().position(|k| *k == address)
        .ok_or(SSSError::RoleNotFound)?;
    list.swap_remove(pos);

    emit!(RoleUpdated {
        mint: mint_key,
        role: role_name(&role),
        address,
        action: "removed".to_string(),
    });

    Ok(())
}

fn role_name(role: &RoleType) -> String {
    match role {
        RoleType::Minter => "minter".to_string(),
        RoleType::Burner => "burner".to_string(),
        RoleType::Pauser => "pauser".to_string(),
        RoleType::Blacklister => "blacklister".to_string(),
        RoleType::Seizer => "seizer".to_string(),
    }
}

#[derive(Accounts)]
#[instruction(minter: Pubkey)]
pub struct UpdateMinterQuota<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
        has_one = authority @ SSSError::Unauthorized,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [MINTER_SEED, stablecoin_config.key().as_ref(), minter.as_ref()],
        bump = minter_info.bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,
}

pub fn update_minter_quota_handler(
    ctx: Context<UpdateMinterQuota>,
    _minter: Pubkey,
    new_quota: u64,
) -> Result<()> {
    let mint_key = ctx.accounts.stablecoin_config.mint;
    let minter_info = &mut ctx.accounts.minter_info;
    minter_info.quota = new_quota;

    emit!(MinterQuotaUpdated {
        mint: mint_key,
        minter: minter_info.minter,
        new_quota,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(minter: Pubkey)]
pub struct AddMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
        has_one = authority @ SSSError::Unauthorized,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref()],
        bump = role_manager.bump,
    )]
    pub role_manager: Account<'info, RoleManager>,

    #[account(
        init,
        payer = authority,
        space = MinterInfo::LEN,
        seeds = [MINTER_SEED, stablecoin_config.key().as_ref(), minter.as_ref()],
        bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    pub system_program: Program<'info, System>,
}

pub fn add_minter_handler(
    ctx: Context<AddMinter>,
    minter: Pubkey,
    quota: u64,
) -> Result<()> {
    let roles = &mut ctx.accounts.role_manager;
    let mint_key = ctx.accounts.stablecoin_config.mint;
    let config_key = ctx.accounts.stablecoin_config.key();

    require!(!roles.minters.contains(&minter), SSSError::AlreadyHasRole);
    require!(roles.minters.len() < MAX_MINTERS, SSSError::RoleCapacityReached);

    roles.minters.push(minter);

    let minter_info = &mut ctx.accounts.minter_info;
    minter_info.minter = minter;
    minter_info.stablecoin = config_key;
    minter_info.quota = quota;
    minter_info.minted = 0;
    minter_info.bump = ctx.bumps.minter_info;

    emit!(RoleUpdated {
        mint: mint_key,
        role: "minter".to_string(),
        address: minter,
        action: "added".to_string(),
    });

    Ok(())
}
