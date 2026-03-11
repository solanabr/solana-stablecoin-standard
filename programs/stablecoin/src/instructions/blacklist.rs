use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
    freeze_account,
    FreezeAccount as FreezeAccountCpi,
};

use crate::state::*;
use crate::errors::SSSError;
use crate::events::{BlacklistEvent, BlacklistAction};

#[derive(Accounts)]
#[instruction(reason: String)]
pub struct BlacklistAdd<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        constraint = config.blacklister == blacklister.key() @ SSSError::Unauthorized,
        constraint = config.enable_transfer_hook @ SSSError::FeatureNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: The wallet being blacklisted
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = blacklister,
        space = BlacklistEntry::space(&reason),
        seeds = [b"blacklist", mint.key().as_ref(), wallet.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: PDA freeze authority
    #[account(
        seeds = [b"authority", mint.key().as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    /// The wallet's token account to freeze (belt + suspenders)
    #[account(
        mut,
        token::mint = mint,
    )]
    pub wallet_token_account: Option<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn blacklist_add_handler(ctx: Context<BlacklistAdd>, reason: String) -> Result<()> {
    require!(reason.len() <= BlacklistEntry::MAX_REASON_LEN, SSSError::ReasonTooLong);

    let clock = Clock::get()?;
    let entry = &mut ctx.accounts.blacklist_entry;
    entry.mint = ctx.accounts.mint.key();
    entry.wallet = ctx.accounts.wallet.key();
    entry.blacklisted_at = clock.unix_timestamp;
    entry.reason = reason.clone();
    entry.blacklisted_by = ctx.accounts.blacklister.key();
    entry.bump = ctx.bumps.blacklist_entry;

    // Also freeze the token account if provided (belt + suspenders)
    if let Some(wallet_token_account) = &ctx.accounts.wallet_token_account {
        let mint_key = ctx.accounts.mint.key();
        let bump = ctx.bumps.mint_authority;
        let signer_seeds: &[&[&[u8]]] = &[&[b"authority", mint_key.as_ref(), &[bump]]];

        freeze_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                FreezeAccountCpi {
                    account: wallet_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer_seeds,
            ),
        )?;
    }

    emit!(BlacklistEvent {
        mint: ctx.accounts.mint.key(),
        wallet: ctx.accounts.wallet.key(),
        action: BlacklistAction::Added,
        reason,
        by: ctx.accounts.blacklister.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct BlacklistRemove<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        constraint = config.blacklister == blacklister.key() @ SSSError::Unauthorized,
        constraint = config.enable_transfer_hook @ SSSError::FeatureNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: The wallet being unblacklisted
    pub wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        close = blacklister,
        seeds = [b"blacklist", mint.key().as_ref(), wallet.key().as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn blacklist_remove_handler(ctx: Context<BlacklistRemove>) -> Result<()> {
    emit!(BlacklistEvent {
        mint: ctx.accounts.mint.key(),
        wallet: ctx.accounts.wallet.key(),
        action: BlacklistAction::Removed,
        reason: String::new(),
        by: ctx.accounts.blacklister.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
