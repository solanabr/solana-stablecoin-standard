use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::onchain::invoke_transfer_checked;
use anchor_spl::token_interface::{
    freeze_account, thaw_account, FreezeAccount, Mint, ThawAccount, TokenAccount, TokenInterface,
};

use crate::{
    constants::*,
    error::SSSError,
    events::TokensSeized,
    state::{RoleManager, StablecoinConfig},
};

#[derive(Accounts)]
pub struct SeizeTokens<'info> {
    pub seizer: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref()],
        bump = role_manager.bump,
    )]
    pub role_manager: Account<'info, RoleManager>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The account to seize tokens FROM (must be frozen)
    #[account(
        mut,
        token::mint = mint,
    )]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    /// The treasury/destination account to receive seized tokens
    #[account(
        mut,
        token::mint = mint,
    )]
    pub destination_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, SeizeTokens<'info>>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, SSSError::ZeroAmount);

    let config = &ctx.accounts.stablecoin_config;
    let roles = &ctx.accounts.role_manager;
    let seizer_key = ctx.accounts.seizer.key();
    let mint_key = ctx.accounts.mint.key();
    let bump = config.bump;

    require!(config.enable_permanent_delegate, SSSError::ComplianceNotEnabled);
    require!(
        config.authority == seizer_key || roles.seizers.contains(&seizer_key),
        SSSError::Unauthorized
    );

    // Must be frozen to prevent concurrent activity during seizure
    require!(
        ctx.accounts.source_token_account.is_frozen(),
        SSSError::AccountNotFrozen
    );

    let source_key = ctx.accounts.source_token_account.key();
    let dest_key = ctx.accounts.destination_token_account.key();
    let decimals = ctx.accounts.mint.decimals;
    let bump_bytes = [bump];
    let inner: &[&[u8]] = &[STABLECOIN_SEED, mint_key.as_ref(), &bump_bytes];
    let signer_seeds: &[&[&[u8]]] = &[inner];

    // Thaw before transfer, re-freeze after. Token-2022 rejects transfers from
    // frozen accounts even with a permanent delegate.
    thaw_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        ThawAccount {
            account: ctx.accounts.source_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.stablecoin_config.to_account_info(),
        },
        signer_seeds,
    ))?;

    // invoke_transfer_checked populates both account metas and account infos
    // for the transfer-hook extra accounts before calling invoke_signed.
    invoke_transfer_checked(
        &ctx.accounts.token_program.key(),
        ctx.accounts.source_token_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.destination_token_account.to_account_info(),
        ctx.accounts.stablecoin_config.to_account_info(),
        ctx.remaining_accounts,
        amount,
        decimals,
        signer_seeds,
    )?;

    // Re-freeze the source so it remains locked after seizure.
    freeze_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        FreezeAccount {
            account: ctx.accounts.source_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.stablecoin_config.to_account_info(),
        },
        signer_seeds,
    ))?;

    emit!(TokensSeized {
        mint: mint_key,
        from: source_key,
        to: dest_key,
        amount,
        by: seizer_key,
    });

    Ok(())
}
