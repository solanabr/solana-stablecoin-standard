use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use spl_token_2022::instruction as t22_ix;

use crate::errors::SssError;
use crate::state::*;

/// Seize tokens from a blacklisted account. SSS-2 only.
/// Uses the permanent delegate extension — the config PDA can transfer from any account.
#[derive(Accounts)]
pub struct SeizeTokens<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"sss_config", mint.key().as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, TokenConfig>,

    #[account(
        seeds = [b"sss_role", config.key().as_ref(), authority.key().as_ref()],
        bump = role.bump,
        constraint = role.config == config.key(),
        constraint = role.authority == authority.key(),
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(
        seeds = [b"sss_blacklist", config.key().as_ref()],
        bump = blacklist.bump,
        constraint = blacklist.config == config.key(),
    )]
    pub blacklist: Account<'info, Blacklist>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The blacklisted user's token account
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub source: InterfaceAccount<'info, TokenAccount>,

    /// Treasury or burn destination. If you want to burn, pass a treasury then burn separately.
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<SeizeTokens>) -> Result<()> {
    let config = &ctx.accounts.config;
    let preset = config.preset_enum().ok_or(SssError::InvalidPreset)?;
    require!(preset.is_compliant(), SssError::PresetMismatch);
    require!(
        ctx.accounts.role.has_role(role_flags::SEIZER),
        SssError::Unauthorized
    );
    require!(!config.paused, SssError::Paused);

    // Verify the account owner is blacklisted
    let owner = ctx.accounts.source.owner;
    require!(
        ctx.accounts.blacklist.contains(&owner),
        SssError::NotBlacklisted
    );

    let amount = ctx.accounts.source.amount;
    require!(amount > 0, SssError::ZeroSeizure);

    // Seize via burn + mint_to instead of transfer_checked.
    // transfer_checked triggers the transfer hook which blocks blacklisted senders,
    // creating a deadlock. burn doesn't trigger the hook, so we burn from the
    // blacklisted account using the permanent delegate, then mint equivalent
    // tokens to the treasury.
    let mint_key = config.mint;
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"sss_config",
        mint_key.as_ref(),
        &[config.bump],
    ]];

    // Step 1: Burn from blacklisted account using permanent delegate authority
    anchor_lang::solana_program::program::invoke_signed(
        &t22_ix::burn_checked(
            ctx.accounts.token_program.key,
            &ctx.accounts.source.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.config.key(), // permanent delegate
            &[],
            amount,
            config.decimals,
        )?,
        &[
            ctx.accounts.source.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Step 2: Mint equivalent tokens to treasury
    anchor_lang::solana_program::program::invoke_signed(
        &t22_ix::mint_to(
            ctx.accounts.token_program.key,
            &ctx.accounts.mint.key(),
            &ctx.accounts.treasury.key(),
            &ctx.accounts.config.key(), // mint authority
            &[],
            amount,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.treasury.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        signer_seeds,
    )?;

    msg!(
        "Seized {} tokens from {} (owner: {}) -> treasury {}",
        amount,
        ctx.accounts.source.key(),
        owner,
        ctx.accounts.treasury.key()
    );
    Ok(())
}
