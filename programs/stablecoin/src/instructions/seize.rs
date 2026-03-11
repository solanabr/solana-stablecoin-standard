use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
};

use crate::state::*;
use crate::errors::SSSError;
use crate::events::SeizeEvent;

#[derive(Accounts)]
pub struct Seize<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        constraint = config.owner == owner.key() @ SSSError::Unauthorized,
        constraint = config.enable_permanent_delegate @ SSSError::FeatureNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: PDA that is the permanent delegate
    #[account(
        seeds = [b"authority", mint.key().as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    /// Blacklist entry must exist for the target wallet
    #[account(
        seeds = [b"blacklist", mint.key().as_ref(), target_wallet.key().as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: The blacklisted wallet
    pub target_wallet: UncheckedAccount<'info>,

    /// The blacklisted wallet's token account (source)
    #[account(
        mut,
        token::mint = mint,
    )]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Treasury token account (destination)
    #[account(
        mut,
        token::mint = mint,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, Seize<'info>>, amount: u64) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.bumps.mint_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[b"authority", mint_key.as_ref(), &[bump]]];

    // Build transfer_checked instruction
    let mut transfer_ix = spl_token_2022::instruction::transfer_checked(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.source_token_account.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.treasury_token_account.key(),
        &ctx.accounts.mint_authority.key(), // permanent delegate
        &[],
        amount,
        ctx.accounts.mint.decimals,
    )?;

    // Append remaining accounts for transfer hook (if mint has a hook)
    let mut account_infos = vec![
        ctx.accounts.source_token_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.treasury_token_account.to_account_info(),
        ctx.accounts.mint_authority.to_account_info(),
    ];
    for remaining in ctx.remaining_accounts {
        transfer_ix.accounts.push(AccountMeta {
            pubkey: remaining.key(),
            is_signer: remaining.is_signer,
            is_writable: remaining.is_writable,
        });
        account_infos.push(remaining.clone());
    }

    invoke_signed(
        &transfer_ix,
        &account_infos,
        signer_seeds,
    )?;

    emit!(SeizeEvent {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.source_token_account.key(),
        to: ctx.accounts.treasury_token_account.key(),
        amount,
        by: ctx.accounts.owner.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
