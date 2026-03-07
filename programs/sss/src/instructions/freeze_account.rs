use anchor_lang::prelude::*;

use crate::{constants::*, events::FreezeAccountEvent, state::RoleAccount};
use anchor_spl::{token_2022::{self, FreezeAccount, Token2022}, token_interface::TokenAccount};

#[event_cpi]
#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    /// Must hold the master role for this mint.
    pub master: Signer<'info>,
    /// CHECK: Token-2022 mint. Verified by master_role + freeze_authority seeds.
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
    /// The token account to freeze.
    #[account(mut)]
    pub ata_to_freeze: InterfaceAccount<'info, TokenAccount>,
    /// Master role PDA for the signer. Existence confirms the master role.
    #[account(
        seeds = [ROLE_SEED, mint.key().as_ref(), MASTER_ROLE, master.key().as_ref()],
        bump = master_role.bump,
    )]
    pub master_role: Account<'info, RoleAccount>,
    /// CHECK: Freeze authority PDA — the program signs on its behalf.
    #[account(
        seeds = [FREEZE_SEED, mint.key().as_ref()],
        bump,
    )]
    pub freeze_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let ata_to_freeze = ctx.accounts.ata_to_freeze.key();
    let bump = ctx.bumps.freeze_authority;
    let freeze_authority_seeds: &[&[u8]] = &[FREEZE_SEED, mint_key.as_ref(), &[bump]];

    token_2022::freeze_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.ata_to_freeze.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.freeze_authority.to_account_info(),
            },
            &[freeze_authority_seeds],
        ),
    )?;

    emit_cpi!(FreezeAccountEvent { ata_to_freeze, mint: mint_key });

    Ok(())
}
