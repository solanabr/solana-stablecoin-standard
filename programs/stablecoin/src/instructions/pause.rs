use anchor_lang::prelude::*;

use crate::instructions::auth::require_operator_role;
use crate::events::PauseToggled;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};

#[derive(Accounts)]
pub struct TogglePause<'info> {
    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,
    pub operator: Signer<'info>,
    pub role_assignment: Option<Account<'info, RoleAssignment>>,
}

pub fn pause_handler(ctx: Context<TogglePause>) -> Result<()> {
    require_operator_role(
        ctx.program_id,
        &ctx.accounts.config,
        &ctx.accounts.operator.key(),
        ctx.accounts.role_assignment.as_ref(),
        RoleType::Pauser,
    )?;
    ctx.accounts.config.is_paused = true;
    emit!(PauseToggled {
        mint: ctx.accounts.config.mint,
        paused: true,
        authority: ctx.accounts.operator.key(),
    });
    Ok(())
}

pub fn unpause_handler(ctx: Context<TogglePause>) -> Result<()> {
    require_operator_role(
        ctx.program_id,
        &ctx.accounts.config,
        &ctx.accounts.operator.key(),
        ctx.accounts.role_assignment.as_ref(),
        RoleType::Pauser,
    )?;
    ctx.accounts.config.is_paused = false;
    emit!(PauseToggled {
        mint: ctx.accounts.config.mint,
        paused: false,
        authority: ctx.accounts.operator.key(),
    });
    Ok(())
}
