use anchor_lang::prelude::*;

use crate::errors::StablecoinError;
use crate::state::{StablecoinConfig, RoleAssignment, Role, RoleAction};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ManageRoleParams {
    pub role: Role,
    pub action: RoleAction,
    pub mint_quota: Option<u64>,
}

#[derive(Accounts)]
#[instruction(params: ManageRoleParams)]
pub struct ManageRole<'info> {
    #[account(
        mut,
        constraint = authority.key() == config.authority @ StablecoinError::NotMasterAuthority,
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"stablecoin-config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: Any valid pubkey can receive a role.
    pub role_holder: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::LEN,
        seeds = [b"role", config.key().as_ref(), role_holder.key().as_ref()],
        bump,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ManageRole>, params: ManageRoleParams) -> Result<()> {
    // Blacklister and Seizer roles require SSS-2
    if params.role == Role::Blacklister || params.role == Role::Seizer {
        require!(
            ctx.accounts.config.is_compliance_enabled(),
            StablecoinError::ComplianceNotEnabled,
        );
    }

    let role_assignment = &mut ctx.accounts.role_assignment;

    if role_assignment.config == Pubkey::default() {
        role_assignment.bump = ctx.bumps.role_assignment;
        role_assignment.config = ctx.accounts.config.key();
        role_assignment.holder = ctx.accounts.role_holder.key();
        role_assignment.minted_amount = 0;
    }

    match params.action {
        RoleAction::Grant => {
            role_assignment.grant_role(params.role);
            if params.role == Role::Minter {
                if let Some(quota) = params.mint_quota {
                    role_assignment.mint_quota = quota;
                }
            }
            msg!(
                "Granted {:?} role to {}",
                params.role,
                ctx.accounts.role_holder.key()
            );
        }
        RoleAction::Revoke => {
            role_assignment.revoke_role(params.role);
            msg!(
                "Revoked {:?} role from {}",
                params.role,
                ctx.accounts.role_holder.key()
            );
        }
    }

    role_assignment.updated_at = Clock::get()?.slot;
    Ok(())
}

// ─── Transfer Authority ──────────────────────────────────────────

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(
        constraint = authority.key() == config.authority @ StablecoinError::NotMasterAuthority,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin-config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn transfer_authority_handler(
    ctx: Context<TransferAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let old_authority = ctx.accounts.config.authority;
    let config = &mut ctx.accounts.config;
    config.authority = new_authority;
    config.updated_at = Clock::get()?.slot;

    msg!(
        "Authority transferred from {} to {}",
        old_authority,
        new_authority
    );
    Ok(())
}
