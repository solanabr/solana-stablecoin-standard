use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};
use crate::state::PrivateStablecoinState;
use crate::errors::SSSPrivateError;
use crate::events::{
    AuditorUpdatedEvent, PausedEvent, UnpausedEvent,
    AuthorityUpdatedEvent, MintedEvent, BurnedEvent,
};

// ─── Update Auditor ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct UpdateAuditor<'info> {
    /// The authority managing this stablecoin
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The private stablecoin state
    #[account(
        mut,
        has_one = authority @ SSSPrivateError::Unauthorized,
    )]
    pub state: Account<'info, PrivateStablecoinState>,
}

pub fn update_auditor_handler(
    ctx: Context<UpdateAuditor>,
    new_auditor_elgamal_pubkey: [u8; 32],
) -> Result<()> {
    require!(
        new_auditor_elgamal_pubkey != [0u8; 32],
        SSSPrivateError::InvalidAuditorKey
    );

    let clock = Clock::get()?;
    let state = &mut ctx.accounts.state;

    let old_key = state.auditor_elgamal_pubkey;
    state.auditor_elgamal_pubkey = new_auditor_elgamal_pubkey;

    // NOTE: In production, this would also call:
    //   spl_token_2022::extension::confidential_transfer::instruction::update_mint(...)

    msg!("SSS-3: Updated auditor ElGamal key for {}", state.mint);

    emit!(AuditorUpdatedEvent {
        state: state.key(),
        old_auditor_key: old_key,
        new_auditor_key: new_auditor_elgamal_pubkey,
        updated_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Pause ───────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct PausePrivate<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ SSSPrivateError::Unauthorized,
        constraint = !state.paused @ SSSPrivateError::AlreadyPaused,
    )]
    pub state: Account<'info, PrivateStablecoinState>,
}

pub fn pause_handler(ctx: Context<PausePrivate>) -> Result<()> {
    let clock = Clock::get()?;
    ctx.accounts.state.paused = true;

    msg!("SSS-3: {} paused by {}", ctx.accounts.state.mint, ctx.accounts.authority.key());

    emit!(PausedEvent {
        state: ctx.accounts.state.key(),
        paused_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Unpause ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct UnpausePrivate<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ SSSPrivateError::Unauthorized,
        constraint = state.paused @ SSSPrivateError::NotPaused,
    )]
    pub state: Account<'info, PrivateStablecoinState>,
}

pub fn unpause_handler(ctx: Context<UnpausePrivate>) -> Result<()> {
    let clock = Clock::get()?;
    ctx.accounts.state.paused = false;

    msg!("SSS-3: {} unpaused by {}", ctx.accounts.state.mint, ctx.accounts.authority.key());

    emit!(UnpausedEvent {
        state: ctx.accounts.state.key(),
        unpaused_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Update Authority ─────────────────────────────────────────────────────────

/// Two-step authority transfer: propose → accept.
/// The current authority proposes a new authority. The new authority must call
/// `accept_authority` to complete the transfer.
#[derive(Accounts)]
pub struct ProposeAuthority<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ SSSPrivateError::Unauthorized,
    )]
    pub state: Account<'info, PrivateStablecoinState>,
}

pub fn propose_authority_handler(ctx: Context<ProposeAuthority>, new_authority: Pubkey) -> Result<()> {
    ctx.accounts.state.pending_authority = Some(new_authority);

    msg!(
        "SSS-3: Authority transfer proposed for {} → {}",
        ctx.accounts.state.mint,
        new_authority
    );

    emit!(AuthorityUpdatedEvent {
        state: ctx.accounts.state.key(),
        old_authority: ctx.accounts.authority.key(),
        new_authority,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    /// The proposed new authority must sign
    #[account(mut)]
    pub new_authority: Signer<'info>,

    #[account(
        mut,
        constraint = state.pending_authority == Some(new_authority.key()) @ SSSPrivateError::Unauthorized,
    )]
    pub state: Account<'info, PrivateStablecoinState>,
}

pub fn accept_authority_handler(ctx: Context<AcceptAuthority>) -> Result<()> {
    let state = &mut ctx.accounts.state;
    let old = state.authority;
    state.authority = ctx.accounts.new_authority.key();
    state.pending_authority = None;

    msg!(
        "SSS-3: Authority accepted for {}: {} → {}",
        state.mint,
        old,
        state.authority
    );

    Ok(())
}

// ─── Mint Tokens ─────────────────────────────────────────────────────────────

/// Mint tokens to allowlisted addresses only.
///
/// The recipient MUST be on the allowlist. In production this would
/// also be subject to minter quotas (like SSS-1). For the PoC,
/// only the authority can mint.
#[derive(Accounts)]
pub struct MintTokensPrivate<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ SSSPrivateError::Unauthorized,
        constraint = !state.paused @ SSSPrivateError::Paused,
        seeds = [b"private-state", mint.key().as_ref()],
        bump = state.bump,
    )]
    pub state: Account<'info, PrivateStablecoinState>,

    /// The allowlist entry of the recipient — must be approved
    #[account(
        seeds = [b"allowlist", state.key().as_ref(), recipient_token_account.owner.as_ref()],
        bump = allowlist_entry.bump,
        constraint = allowlist_entry.approved @ SSSPrivateError::NotOnAllowlist,
    )]
    pub allowlist_entry: Account<'info, crate::state::AllowlistEntry>,

    #[account(
        mut,
        constraint = mint.key() == state.mint @ SSSPrivateError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn mint_tokens_handler(ctx: Context<MintTokensPrivate>, amount: u64) -> Result<()> {
    require!(amount > 0, SSSPrivateError::ZeroAmount);

    let clock = Clock::get()?;

    // CPI: mint_to via Token-2022
    anchor_spl::token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_interface::MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.state.to_account_info(),
            },
            &[&[
                b"private-state",
                ctx.accounts.mint.key().as_ref(),
                &[ctx.accounts.state.bump],
            ]],
        ),
        amount,
    )?;

    let state = &mut ctx.accounts.state;
    state.total_minted = state.total_minted.checked_add(amount).unwrap();

    msg!(
        "SSS-3: Minted {} tokens to {} for mint {}",
        amount,
        ctx.accounts.recipient_token_account.owner,
        state.mint
    );

    emit!(MintedEvent {
        state: state.key(),
        recipient: ctx.accounts.recipient_token_account.owner,
        amount,
        minted_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Burn Tokens ─────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct BurnTokensPrivate<'info> {
    /// Token owner (self-burn) or authority (forced burn via permanent delegate)
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = !state.paused @ SSSPrivateError::Paused,
        seeds = [b"private-state", mint.key().as_ref()],
        bump = state.bump,
    )]
    pub state: Account<'info, PrivateStablecoinState>,

    #[account(
        mut,
        constraint = mint.key() == state.mint @ SSSPrivateError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn burn_tokens_handler(ctx: Context<BurnTokensPrivate>, amount: u64) -> Result<()> {
    require!(amount > 0, SSSPrivateError::ZeroAmount);

    let clock = Clock::get()?;

    // SSS-3 allows self-burn (owner == authority) or authority-forced burn
    let is_owner = ctx.accounts.authority.key() == ctx.accounts.token_account.owner;
    let is_authority = ctx.accounts.authority.key() == ctx.accounts.state.authority;
    require!(is_owner || is_authority, SSSPrivateError::Unauthorized);

    anchor_spl::token_interface::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_interface::Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        amount,
    )?;

    let state = &mut ctx.accounts.state;
    state.total_burned = state.total_burned.checked_add(amount).unwrap();

    msg!(
        "SSS-3: Burned {} tokens from {} for mint {}",
        amount,
        ctx.accounts.token_account.owner,
        state.mint
    );

    emit!(BurnedEvent {
        state: state.key(),
        from: ctx.accounts.token_account.owner,
        amount,
        burned_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
