use anchor_lang::prelude::*;

use crate::{constants::*, error::StableError, events::UnpauseEvent, state::RoleAccount};
use anchor_spl::token_2022::spl_token_2022::{
    self,
    extension::{pausable::instruction as pausable_ix, BaseStateWithExtensions, StateWithExtensions},
    state::Mint as SplMint,
};

#[event_cpi]
#[derive(Accounts)]
pub struct Unpause<'info> {
    /// Must hold the pauser role for this mint.
    pub pauser: Signer<'info>,
    /// CHECK: Token-2022 mint with Pausable extension. Verified by pauser_role + pause_authority seeds.
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
    /// Pauser role PDA. Existence confirms the pauser role.
    #[account(
        seeds = [ROLE_SEED, mint.key().as_ref(), PAUSER_ROLE, pauser.key().as_ref()],
        bump = pauser_role.bump,
    )]
    pub pauser_role: Account<'info, RoleAccount>,
    /// CHECK: Pause authority PDA — the program signs on its behalf via invoke_signed.
    #[account(
        seeds = [PAUSE_SEED, mint.key().as_ref()],
        bump,
    )]
    pub pause_authority: UncheckedAccount<'info>,
    /// CHECK: Token-2022 program.
    pub token_program: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<Unpause>) -> Result<()> {
    // Verify the mint actually has the Pausable extension (SSS2 only).
    let mint_data = ctx.accounts.mint.data.borrow();
    StateWithExtensions::<SplMint>::unpack(&mint_data)
        .map_err(|_| StableError::MintNotPausable)?
        .get_extension::<spl_token_2022::extension::pausable::PausableConfig>()
        .map_err(|_| StableError::MintNotPausable)?;
    drop(mint_data);

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.bumps.pause_authority;
    let pause_authority_seeds: &[&[u8]] = &[PAUSE_SEED, mint_key.as_ref(), &[bump]];

    let resume_ix = pausable_ix::resume(
        &spl_token_2022::ID,
        &mint_key,
        &ctx.accounts.pause_authority.key(),
        &[],
    )?;

    anchor_lang::solana_program::program::invoke_signed(
        &resume_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.pause_authority.to_account_info(),
        ],
        &[pause_authority_seeds],
    )?;

    emit_cpi!(UnpauseEvent {
        pauser: ctx.accounts.pauser.key(),
        mint: mint_key,
    });

    Ok(())
}
