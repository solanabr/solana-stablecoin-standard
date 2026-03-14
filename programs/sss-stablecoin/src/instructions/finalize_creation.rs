//! Finalize stablecoin creation after client-side metadata initialization.

use crate::{
    constants::CONFIG_SEED,
    error::StablecoinError,
    events::CreationFinalized,
    state::StablecoinConfig,
};
use anchor_lang::{
    prelude::*,
    solana_program::program::invoke,
};
use anchor_spl::token_2022::Token2022;
use spl_token_2022::instruction::{self as token_2022_instruction, AuthorityType};

pub fn handler(ctx: Context<FinalizeCreation>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.config.master_authority,
        ctx.accounts.authority.key(),
        StablecoinError::Unauthorized
    );

    let token_program = ctx.accounts.token_program.key();
    let mint = ctx.accounts.mint.key();
    let authority = ctx.accounts.authority.key();
    let config = ctx.accounts.config.key();

    invoke(
        &token_2022_instruction::set_authority(
            &token_program,
            &mint,
            Some(&config),
            AuthorityType::MintTokens,
            &authority,
            &[],
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
    )?;

    invoke(
        &token_2022_instruction::set_authority(
            &token_program,
            &mint,
            Some(&config),
            AuthorityType::FreezeAccount,
            &authority,
            &[],
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
    )?;

    emit!(CreationFinalized {
        mint,
        config,
        authority,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeCreation<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: validated by Token-2022 and the config PDA seed derivation above.
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}
