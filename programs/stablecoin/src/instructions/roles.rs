use anchor_lang::prelude::*;

use crate::errors::StablecoinError;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateRoleParams {
    pub holder: Pubkey,
    pub role: RoleType,
    pub is_active: bool,
    pub mint_quota: Option<u64>,
}

#[derive(Accounts)]
#[instruction(params: UpdateRoleParams)]
pub struct UpdateRoles<'info> {
    #[account(has_one = authority, has_one = mint)]
    pub config: Account<'info, StablecoinConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Mint account key is used for PDA derivation and config matching in this scaffold.
    pub mint: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::LEN,
        seeds = [
            b"role",
            mint.key().as_ref(),
            &[params.role.discriminator()],
            params.holder.as_ref()
        ],
        bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    pub system_program: Program<'info, System>,
}

pub fn update_roles_handler(ctx: Context<UpdateRoles>, params: UpdateRoleParams) -> Result<()> {
    let role_assignment = &mut ctx.accounts.role_assignment;
    let is_new_assignment = role_assignment.bump == 0;
    role_assignment.mint = ctx.accounts.mint.key();
    role_assignment.holder = params.holder;
    role_assignment.role = params.role;
    role_assignment.is_active = params.is_active;
    role_assignment.mint_quota = params.mint_quota;
    if is_new_assignment {
        role_assignment.minted_so_far = 0;
    }
    if !role_assignment.is_active {
        role_assignment.mint_quota = None;
        role_assignment.minted_so_far = 0;
    }
    role_assignment.bump = ctx.bumps.role_assignment;

    Ok(())
}

#[derive(Accounts)]
pub struct ProposeAuthority<'info> {
    #[account(mut, has_one = authority)]
    pub config: Account<'info, StablecoinConfig>,
    pub authority: Signer<'info>,
}

pub fn propose_authority_handler(ctx: Context<ProposeAuthority>, pending: Pubkey) -> Result<()> {
    ctx.accounts.config.pending_authority = Some(pending);
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,
    pub pending_authority: Signer<'info>,
}

pub fn accept_authority_handler(ctx: Context<AcceptAuthority>) -> Result<()> {
    require!(
        ctx.accounts.config.pending_authority == Some(ctx.accounts.pending_authority.key()),
        StablecoinError::InvalidPendingAuthority
    );
    ctx.accounts.config.authority = ctx.accounts.pending_authority.key();
    ctx.accounts.config.pending_authority = None;
    Ok(())
}
