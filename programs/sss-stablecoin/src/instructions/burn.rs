//! Burn instruction for destroying tokens

use crate::{
    constants::CONFIG_SEED, error::StablecoinError, events::Burned, state::StablecoinConfig,
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    burn, Burn as TokenBurn, Mint as TokenMint, Token2022, TokenAccount,
};

/// Burn tokens from an account
///
/// If the signer is the token owner, they can burn their own tokens.
/// If the signer is the burner role, they can burn from any account (requires permanent delegate).
pub fn handler(ctx: Context<Burn>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, StablecoinError::Paused);
    require_keys_eq!(
        ctx.accounts.from.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidTokenAccount
    );

    let signer = ctx.accounts.authority.key();
    let account_owner = ctx.accounts.from.owner;

    if signer == account_owner {
        // Self-burn
        let cpi_accounts = TokenBurn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.from.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        burn(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
            amount,
        )?;
    } else {
        // Burner role burn (requires permanent delegate)
        require!(is_burner(config, &signer), StablecoinError::Unauthorized);
        require!(
            config.permanent_delegate_enabled,
            StablecoinError::PermanentDelegateDisabled
        );

        let mint_key = ctx.accounts.mint.key();
        let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
        let signer_seeds: &[&[&[u8]]] = &[config_seeds];

        let cpi_accounts = TokenBurn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.from.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        };
        burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            ),
            amount,
        )?;
    }

    emit!(Burned {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.from.key(),
        authority: signer,
        amount,
    });

    Ok(())
}

fn is_burner(config: &StablecoinConfig, signer: &Pubkey) -> bool {
    *signer == config.master_authority || *signer == config.burner
}

#[derive(Accounts)]
pub struct Burn<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, TokenMint>,

    #[account(mut)]
    pub from: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}
