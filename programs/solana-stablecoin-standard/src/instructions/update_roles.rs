use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SssError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateRolesParams {
    pub new_minter: Option<Pubkey>,
    pub new_burner: Option<Pubkey>,
    pub new_blacklister: Option<Pubkey>,
    pub new_pauser: Option<Pubkey>,
    pub new_seizer: Option<Pubkey>,
    pub new_minter_quota: Option<u64>,
}

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    /// Only master_authority can update roles
    pub authority: Signer<'info>,

    /// CHECK: used as seed only
    pub mint: AccountInfo<'info>,

    #[account(
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,
}

pub fn handler(ctx: Context<UpdateRoles>, params: UpdateRolesParams) -> Result<()> {
    let caller = ctx.accounts.authority.key();
    let roles = &mut ctx.accounts.roles_config;

    require!(caller == roles.master_authority, SssError::Unauthorized);

    if let Some(new_minter) = params.new_minter {
        roles.minter = new_minter;
    }
    if let Some(new_burner) = params.new_burner {
        roles.burner = new_burner;
    }
    if let Some(new_blacklister) = params.new_blacklister {
        require!(
            ctx.accounts.stablecoin_config.permanent_delegate_enabled,
            SssError::Sss2NotEnabled
        );
        roles.blacklister = new_blacklister;
    }
    if let Some(new_pauser) = params.new_pauser {
        roles.pauser = new_pauser;
    }
    if let Some(new_seizer) = params.new_seizer {
        require!(
            ctx.accounts.stablecoin_config.permanent_delegate_enabled,
            SssError::Sss2NotEnabled
        );
        roles.seizer = new_seizer;
    }
    if let Some(quota) = params.new_minter_quota {
        roles.minter_quota = quota;
        roles.minted_this_epoch = 0; // reset epoch on quota change
    }

    msg!("Roles updated for mint: {}", ctx.accounts.mint.key());
    Ok(())
}

/// Transfer master authority (two-step would be better, but one-step for simplicity)
#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub current_authority: Signer<'info>,

    /// CHECK: used as seed only
    pub mint: AccountInfo<'info>,

    #[account(
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,
}

pub fn transfer_authority_handler(
    ctx: Context<TransferAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let caller = ctx.accounts.current_authority.key();
    let roles = &mut ctx.accounts.roles_config;
    require!(caller == roles.master_authority, SssError::Unauthorized);

    roles.master_authority = new_authority;
    msg!(
        "Master authority transferred to: {} for mint: {}",
        new_authority,
        ctx.accounts.mint.key()
    );
    Ok(())
}
