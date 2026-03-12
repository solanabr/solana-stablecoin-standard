use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::{
    constants::{BLACKLIST_SEED, STABLECOIN_SEED},
    error::SssError,
    events::{AddressBlacklisted, AddressRemovedFromBlacklist, TokensSeized},
    state::{BlacklistEntry, RoleKind, StablecoinState},
};

// ============ Add to blacklist ============

#[derive(Accounts)]
#[instruction(reason: String)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_state.bump,
        has_one = mint,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: The address being blacklisted.
    pub target: AccountInfo<'info>,

    #[account(
        init,
        payer = blacklister,
        space = BlacklistEntry::space(&reason),
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), target.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
    let state = &ctx.accounts.stablecoin_state;
    let caller = ctx.accounts.blacklister.key();

    require!(
        state.enable_transfer_hook || state.enable_permanent_delegate,
        SssError::ComplianceNotEnabled
    );
    require!(
        state.authority == caller || state.has_role(&caller, &RoleKind::Blacklister),
        SssError::Unauthorized
    );

    let mint_key = ctx.accounts.mint.key();
    let target_key = ctx.accounts.target.key();

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.mint = mint_key;
    entry.address = target_key;
    entry.blacklisted_by = caller;
    entry.reason = reason.clone();
    entry.timestamp = Clock::get()?.unix_timestamp;
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(AddressBlacklisted {
        mint: mint_key,
        address: target_key,
        blacklister: caller,
        reason,
        timestamp: entry.timestamp,
    });

    Ok(())
}

// ============ Remove from blacklist ============

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_state.bump,
        has_one = mint,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: The address being removed from the blacklist.
    pub target: AccountInfo<'info>,

    #[account(
        mut,
        close = blacklister,
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), target.key().as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    let state = &ctx.accounts.stablecoin_state;
    let caller = ctx.accounts.blacklister.key();

    require!(
        state.authority == caller || state.has_role(&caller, &RoleKind::Blacklister),
        SssError::Unauthorized
    );

    emit!(AddressRemovedFromBlacklist {
        mint: ctx.accounts.mint.key(),
        address: ctx.accounts.target.key(),
        blacklister: caller,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ============ Seize ============

#[derive(Accounts)]
pub struct Seize<'info> {
    pub seizer: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_state.bump,
        has_one = mint,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The frozen account to seize from.
    #[account(
        mut,
        token::mint = mint,
        constraint = frozen_account.is_frozen() @ SssError::AccountNotFrozen,
    )]
    pub frozen_account: InterfaceAccount<'info, TokenAccount>,

    /// Destination for seized tokens (treasury).
    #[account(
        mut,
        token::mint = mint,
    )]
    pub treasury_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
    let state = &ctx.accounts.stablecoin_state;
    let caller = ctx.accounts.seizer.key();

    require!(state.enable_permanent_delegate, SssError::PermanentDelegateNotEnabled);
    require!(amount > 0, SssError::ZeroAmount);
    require!(
        state.authority == caller || state.has_role(&caller, &RoleKind::Seizer),
        SssError::Unauthorized
    );

    let mint_key = ctx.accounts.mint.key();
    let bump = state.bump;
    let seeds = &[STABLECOIN_SEED, mint_key.as_ref(), &[bump]];

    // Use the permanent delegate (stablecoin PDA) to transfer tokens
    anchor_spl::token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_interface::TransferChecked {
                from: ctx.accounts.frozen_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury_account.to_account_info(),
                authority: ctx.accounts.stablecoin_state.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    emit!(TokensSeized {
        mint: mint_key,
        from: ctx.accounts.frozen_account.key(),
        to: ctx.accounts.treasury_account.key(),
        seizer: caller,
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
