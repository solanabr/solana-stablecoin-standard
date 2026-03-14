//! Update minter role instruction

use crate::{
    constants::{CONFIG_SEED, MINTER_ROLE_SEED},
    error::StablecoinError,
    events::MinterUpdated,
    state::{MinterRole, StablecoinConfig},
};
use anchor_lang::prelude::*;

/// Update a minter's configuration
pub fn handler(ctx: Context<UpdateMinter>, args: UpdateMinterArgs) -> Result<()> {
    let config = &ctx.accounts.config;
    require_master(config, &ctx.accounts.authority.key())?;

    let role = &mut ctx.accounts.minter_role;
    role.bump = ctx.bumps.minter_role;
    role.config = config.key();
    role.authority = ctx.accounts.minter_authority.key();
    role.active = args.active;
    role.quota_amount = args.quota_amount;
    role.window_seconds = args.window_seconds;

    if args.reset_window {
        role.window_start_ts = Clock::get()?.unix_timestamp;
        role.minted_in_window = 0;
    }

    emit!(MinterUpdated {
        mint: config.mint,
        authority: ctx.accounts.authority.key(),
        minter: role.authority,
        active: role.active,
        quota_amount: role.quota_amount,
        window_seconds: role.window_seconds,
    });

    Ok(())
}

fn require_master(config: &StablecoinConfig, signer: &Pubkey) -> Result<()> {
    require_keys_eq!(
        config.master_authority,
        *signer,
        StablecoinError::Unauthorized
    );
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: only used for seed derivation.
    pub mint: UncheckedAccount<'info>,

    /// CHECK: authority key for the target minter.
    pub minter_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + MinterRole::INIT_SPACE,
        seeds = [MINTER_ROLE_SEED, config.key().as_ref(), minter_authority.key().as_ref()],
        bump
    )]
    pub minter_role: Account<'info, MinterRole>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateMinterArgs {
    pub active: bool,
    pub quota_amount: u64,
    pub window_seconds: i64,
    pub reset_window: bool,
}
