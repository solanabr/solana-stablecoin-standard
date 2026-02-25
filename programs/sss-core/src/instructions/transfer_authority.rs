use anchor_lang::prelude::*;

use crate::constants::*;
use crate::events::AuthorityTransferred;
use crate::state::{Role, RoleAccount, StablecoinConfig};

// ---------------------------------------------------------------------------
// Transfer Authority — atomic admin swap
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [SSS_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The caller's admin role PDA — will be closed.
    #[account(
        mut,
        close = admin,
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            admin.key().as_ref(),
            &[Role::Admin.as_u8()],
        ],
        bump = admin_role.bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,

    /// CHECK: The new authority address receiving admin role.
    pub new_authority: UncheckedAccount<'info>,

    /// The new authority's admin role PDA — will be created.
    #[account(
        init,
        payer = admin,
        space = ROLE_SPACE,
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            new_authority.key().as_ref(),
            &[Role::Admin.as_u8()],
        ],
        bump,
    )]
    pub new_admin_role: Account<'info, RoleAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler_transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
    let new_role = &mut ctx.accounts.new_admin_role;
    new_role.config = ctx.accounts.config.key();
    new_role.address = ctx.accounts.new_authority.key();
    new_role.role = Role::Admin;
    new_role.granted_by = ctx.accounts.admin.key();
    new_role.granted_at = Clock::get()?.unix_timestamp;
    new_role.bump = ctx.bumps.new_admin_role;

    // Update config.authority so on-chain queries reflect the new admin
    ctx.accounts.config.authority = ctx.accounts.new_authority.key();

    emit!(AuthorityTransferred {
        config: ctx.accounts.config.key(),
        from: ctx.accounts.admin.key(),
        to: ctx.accounts.new_authority.key(),
    });

    Ok(())
}
