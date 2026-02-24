use anchor_lang::prelude::*;

use crate::{errors::SssError, events::MinterUpdated, state::{MinterInfo, StablecoinState}};

#[derive(Accounts)]
#[instruction(quota: u64, active: bool)]
pub struct UpdateMinter<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
        constraint = authority.key() == state.master_authority @ SssError::Unauthorized,
    )]
    pub state: Account<'info, StablecoinState>,

    /// The minter wallet being registered or updated
    /// CHECK: We just store this pubkey — no signing required
    pub minter: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = MinterInfo::LEN,
        seeds = [b"minter", state.key().as_ref(), minter.key().as_ref()],
        bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateMinter>, quota: u64, active: bool) -> Result<()> {
    let minter_info = &mut ctx.accounts.minter_info;
    let is_new = minter_info.stablecoin == Pubkey::default();

    if is_new {
        minter_info.stablecoin = ctx.accounts.state.key();
        minter_info.minter = ctx.accounts.minter.key();
        minter_info.minted_this_epoch = 0;
        minter_info.bump = ctx.bumps.minter_info;
    }

    minter_info.quota = quota;
    minter_info.active = active;

    // Reset epoch counter when re-activating or changing quota
    if is_new || !active {
        minter_info.minted_this_epoch = 0;
    }

    emit!(MinterUpdated {
        mint: ctx.accounts.state.mint,
        minter: ctx.accounts.minter.key(),
        quota,
        active,
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}