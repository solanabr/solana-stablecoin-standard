use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SSSError;
use crate::events::MinterRemoved;
use crate::state::{MinterState, StablecoinConfig};

#[derive(Accounts)]
pub struct RemoveMinter<'info> {
    pub master_minter: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = master_minter.key() == config.master_minter @ SSSError::NotMasterMinter,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [MINTER_SEED, config.key().as_ref(), minter_state.minter.as_ref()],
        bump = minter_state.bump,
        constraint = minter_state.config == config.key(),
    )]
    pub minter_state: Account<'info, MinterState>,
}

pub fn handle_remove_minter(ctx: Context<RemoveMinter>) -> Result<()> {
    let minter_wallet = ctx.accounts.minter_state.minter;

    // ── UPDATE STATE: Disable but keep for audit trail ──────────────────────
    ctx.accounts.minter_state.enabled = false;

    // ── EMIT EVENT ──────────────────────────────────────────────────────────
    emit!(MinterRemoved {
        config: ctx.accounts.config.key(),
        minter: minter_wallet,
        removed_by: ctx.accounts.master_minter.key(),
    });

    Ok(())
}
