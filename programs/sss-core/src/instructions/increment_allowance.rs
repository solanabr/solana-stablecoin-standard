use anchor_lang::prelude::*;

use crate::error::SssError;
use crate::events::AllowanceIncremented;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct IncrementAllowance<'info> {
    #[account(
        constraint = admin.key() == config.admin @ SssError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [
            b"sss_role",
            config.key().as_ref(),
            minter_role_account.holder.as_ref(),
            &[Role::Minter.discriminant()],
        ],
        bump = minter_role_account.bump,
        constraint = minter_role_account.role == Role::Minter @ SssError::Unauthorized,
    )]
    pub minter_role_account: Account<'info, RoleAccount>,
}

pub fn handler(ctx: Context<IncrementAllowance>, amount: u64) -> Result<()> {
    // Note: increment_allowance is exempt from pause — admin must prepare for unpause
    require!(amount > 0, SssError::ZeroAmount);

    let role_account = &mut ctx.accounts.minter_role_account;
    let new_allowance = role_account
        .allowance
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;
    role_account.allowance = new_allowance;

    emit!(AllowanceIncremented {
        config: ctx.accounts.config.key(),
        minter: role_account.holder,
        increment: amount,
        new_allowance,
    });

    Ok(())
}
