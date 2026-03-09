use anchor_lang::prelude::*;

use crate::error::SssError;
use crate::events::RoleGranted;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
#[instruction(role: Role)]
pub struct GrantRole<'info> {
    #[account(
        mut,
        constraint = admin.key() == config.admin @ SssError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: The wallet to grant the role to
    pub holder: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        space = RoleAccount::LEN,
        seeds = [
            b"sss_role",
            config.key().as_ref(),
            holder.key().as_ref(),
            &[role.discriminant()],
        ],
        bump,
    )]
    pub role_account: Account<'info, RoleAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<GrantRole>, role: Role, allowance: u64) -> Result<()> {
    // Note: grant_role is exempt from pause — admin must manage roles during emergencies
    require!(ctx.accounts.holder.key() != Pubkey::default(), SssError::InvalidInput);

    let role_account = &mut ctx.accounts.role_account;
    role_account.config = ctx.accounts.config.key();
    role_account.holder = ctx.accounts.holder.key();
    role_account.role = role;
    role_account.allowance = allowance;
    role_account.bump = ctx.bumps.role_account;

    emit!(RoleGranted {
        config: ctx.accounts.config.key(),
        holder: ctx.accounts.holder.key(),
        role: role.discriminant(),
        allowance,
        granted_by: ctx.accounts.admin.key(),
    });

    Ok(())
}
