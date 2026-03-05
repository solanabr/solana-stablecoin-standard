use anchor_lang::prelude::*;

use crate::{errors::SssError, events::MinterUpdated, state::{MinterInfo, StablecoinState}};

// ─── Add Minter ──────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct AddMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
    )]
    pub state: Account<'info, StablecoinState>,

    ///CHECK: We only need the minter's pubkey
    pub minter: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = MinterInfo::LEN,
        seeds = [
            b"minter",
            state.key().as_ref(),
            minter.key().as_ref(),
        ],
        bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    pub system_program: Program<'info, System>,
}

pub fn add_minter_handler(ctx: Context<AddMinter>, quota: u64) -> Result<()> {
    // Verify authority
    require!(ctx.accounts.authority.key() == ctx.accounts.state.master_authority, SssError::Unauthorized);
    
    let minter_info = &mut ctx.accounts.minter_info;
    
    // Initialize only if it's a new account
    if minter_info.stablecoin == Pubkey::default() {
        minter_info.stablecoin = ctx.accounts.state.key();
        minter_info.minter = ctx.accounts.minter.key();
        minter_info.minted_this_epoch = 0;
        minter_info.bump = ctx.bumps.minter_info;
    }

    // Set active to true and update quota
    minter_info.quota = quota;
    minter_info.active = true;

    // Reset counter if this was a reactivation
    minter_info.minted_this_epoch = 0;

    emit!(MinterUpdated {
        mint: ctx.accounts.state.mint,
        minter: ctx.accounts.minter.key(),
        quota,
        active: true,
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ─── Remove Minter ───────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RemoveMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
    )]
    pub state: Account<'info, StablecoinState>,

    ///CHECK: We only need the minter's pubkey
    pub minter: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            b"minter",
            state.key().as_ref(),
            minter.key().as_ref(),
        ],
        bump = minter_info.bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,
}

pub fn remove_minter_handler(ctx: Context<RemoveMinter>) -> Result<()> {
    // Verify authority
    require!(ctx.accounts.authority.key() == ctx.accounts.state.master_authority, SssError::Unauthorized);
    
    let minter_info = &mut ctx.accounts.minter_info;
    
    // Ensure minter exists and is active
    require!(minter_info.stablecoin != Pubkey::default(), SssError::MinterNotFound);
    require!(minter_info.active, SssError::MinterAlreadyInactive);
    
    // Just set active to false - keep account for future reactivation
    minter_info.active = false;

    emit!(MinterUpdated {
        mint: ctx.accounts.state.mint,
        minter: ctx.accounts.minter.key(),
        quota: minter_info.quota,
        active: false,
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}