use anchor_lang::prelude::*;

use crate::{errors::SssError, events::RolesUpdated, state::{RoleUpdate, StablecoinState}};

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
        constraint = authority.key() == state.master_authority @ SssError::Unauthorized,
    )]
    pub state: Account<'info, StablecoinState>,
}

pub fn handler(ctx: Context<UpdateRoles>, role_update: RoleUpdate) -> Result<()> {
    let state = &mut ctx.accounts.state;

    // Apply updates — None means "leave unchanged", Some(key) means "set",
    // Some(Pubkey::default()) means "clear"
    if let Some(pauser) = role_update.pauser {
        state.pauser = if pauser == Pubkey::default() { None } else { Some(pauser) };
    }
    if let Some(burner) = role_update.burner {
        state.burner = if burner == Pubkey::default() { None } else { Some(burner) };
    }

    // SSS-2 roles — silently ignored if compliance not enabled
    if state.compliance_enabled {
        if let Some(blacklister) = role_update.blacklister {
            state.blacklister = if blacklister == Pubkey::default() { None } else { Some(blacklister) };
        }
        if let Some(seizer) = role_update.seizer {
            state.seizer = if seizer == Pubkey::default() { None } else { Some(seizer) };
        }
    }

    emit!(RolesUpdated {
        mint: state.mint,
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}