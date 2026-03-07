use anchor_lang::prelude::*;

use crate::{constants::*, events::TransferAuthorityEvent, state::RoleAccount};

#[event_cpi]
#[derive(Accounts)]
#[instruction(new_master: Pubkey)]
pub struct TransferAuthority<'info> {
    /// Current master; their RoleAccount will be closed.
    #[account(mut)]
    pub master: Signer<'info>,
    /// CHECK: Token-2022 mint. Used as seed component.
    pub mint: UncheckedAccount<'info>,
    /// Current master's role PDA — will be closed, lamports returned to master.
    #[account(
        mut,
        close = master,
        seeds = [ROLE_SEED, mint.key().as_ref(), MASTER_ROLE, master.key().as_ref()],
        bump = master_role.bump,
    )]
    pub master_role: Account<'info, RoleAccount>,
    /// New master's role PDA — will be created.
    #[account(
        init,
        payer = master,
        space = RoleAccount::DISCRIMINATOR.len() + RoleAccount::INIT_SPACE,
        seeds = [ROLE_SEED, mint.key().as_ref(), MASTER_ROLE, new_master.as_ref()],
        bump,
    )]
    pub new_master_role: Account<'info, RoleAccount>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TransferAuthority>, _new_master: Pubkey) -> Result<()> {
    ctx.accounts.new_master_role.bump = ctx.bumps.new_master_role;

    emit_cpi!(TransferAuthorityEvent {
        master: ctx.accounts.master.key(),
        new_master: _new_master,
        mint: ctx.accounts.mint.key(),
    });

    Ok(())
}
