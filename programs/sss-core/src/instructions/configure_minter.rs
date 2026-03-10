use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SSSError;
use crate::events::MinterConfigured;
use crate::state::{MinterState, StablecoinConfig};

#[derive(Accounts)]
#[instruction(minter_wallet: Pubkey)]
pub struct ConfigureMinter<'info> {
    /// The master minter who is configuring this minter.
    #[account(mut)]
    pub master_minter: Signer<'info>,

    /// The stablecoin config. Validates signer is master_minter and not paused.
    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = master_minter.key() == config.master_minter @ SSSError::NotMasterMinter,
        constraint = !config.paused @ SSSError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Per-minter state. Created if it doesn't exist, updated if it does.
    #[account(
        init_if_needed,
        payer = master_minter,
        space = 8 + MinterState::INIT_SPACE,
        seeds = [MINTER_SEED, config.key().as_ref(), minter_wallet.as_ref()],
        bump,
    )]
    pub minter_state: Account<'info, MinterState>,

    pub system_program: Program<'info, System>,
}

pub fn handle_configure_minter(
    ctx: Context<ConfigureMinter>,
    minter_wallet: Pubkey,
    quota: u64,
) -> Result<()> {
    // ── UPDATE STATE ────────────────────────────────────────────────────────
    let minter_state = &mut ctx.accounts.minter_state;
    minter_state.config = ctx.accounts.config.key();
    minter_state.minter = minter_wallet;
    minter_state.quota = quota;
    minter_state.enabled = true;
    minter_state.bump = ctx.bumps.minter_state;
    // Note: minted_amount is preserved if already initialized (init_if_needed)

    // ── EMIT EVENT ──────────────────────────────────────────────────────────
    emit!(MinterConfigured {
        config: ctx.accounts.config.key(),
        minter: minter_wallet,
        quota,
        configured_by: ctx.accounts.master_minter.key(),
    });

    Ok(())
}
