use anchor_lang::prelude::*;

use crate::{
    constants::{MINTER_RECORD_SEED, STABLECOIN_SEED},
    error::SssError,
    events::MinterUpdated,
    state::{MinterRecord, RoleKind, StablecoinState},
};

#[derive(Accounts)]
#[instruction(cap: Option<u64>, active: bool)]
pub struct UpdateMinterRecord<'info> {
    #[account(
        mut,
        constraint = stablecoin_state.authority == authority.key() @ SssError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    /// CHECK: The minter address being granted/updated.
    pub minter: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = MinterRecord::SPACE,
        seeds = [MINTER_RECORD_SEED, stablecoin_state.mint.as_ref(), minter.key().as_ref()],
        bump,
    )]
    pub minter_record: Account<'info, MinterRecord>,

    pub system_program: Program<'info, System>,
}

pub fn update_minter(
    ctx: Context<UpdateMinterRecord>,
    cap: Option<u64>,
    active: bool,
) -> Result<()> {
    let record = &mut ctx.accounts.minter_record;
    let mint_key = ctx.accounts.stablecoin_state.mint;
    let minter_key = ctx.accounts.minter.key();

    record.mint = mint_key;
    record.minter = minter_key;
    record.cap = cap;
    record.active = active;
    record.bump = ctx.bumps.minter_record;

    emit!(MinterUpdated {
        mint: mint_key,
        minter: minter_key,
        cap,
        active,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateRole<'info> {
    #[account(
        constraint = stablecoin_state.authority == authority.key() @ SssError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
}

pub fn update_role(
    ctx: Context<UpdateRole>,
    role: RoleKind,
    holder: Pubkey,
    active: bool,
) -> Result<()> {
    let state = &mut ctx.accounts.stablecoin_state;
    if active {
        state.add_role(holder, &role);
    } else {
        state.remove_role(&holder, &role);
    }
    Ok(())
}
