use anchor_lang::prelude::*;
use crate::state::PrivateStablecoinState;
use crate::errors::SSSPrivateError;
use crate::events::InitializePrivateEvent;

// ─── Parameters ──────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitPrivateParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    /// ElGamal public key for the designated auditor
    pub auditor_elgamal_pubkey: [u8; 32],
    /// Whether to enable permanent delegate (SSS-2)
    pub enable_permanent_delegate: bool,
    /// Whether to enable transfer hook (SSS-2)
    pub enable_transfer_hook: bool,
}

// ─── Accounts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(params: InitPrivateParams)]
pub struct InitializePrivate<'info> {
    /// The authority who will manage this stablecoin
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The Token-2022 mint to be created
    /// CHECK: Will be initialized by SPL Token-2022 with ConfidentialTransferMint extension
    #[account(mut)]
    pub mint: Signer<'info>,

    /// The on-chain state PDA
    #[account(
        init,
        payer = authority,
        space = PrivateStablecoinState::SIZE,
        seeds = [b"private-state", mint.key().as_ref()],
        bump,
    )]
    pub state: Account<'info, PrivateStablecoinState>,

    /// Token-2022 program
    pub token_program: Program<'info, anchor_spl::token_2022::Token2022>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// ─── Handler ─────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<InitializePrivate>, params: InitPrivateParams) -> Result<()> {
    // Validate input lengths
    require!(params.name.len() <= 32, SSSPrivateError::NameTooLong);
    require!(params.symbol.len() <= 10, SSSPrivateError::SymbolTooLong);
    require!(params.uri.len() <= 200, SSSPrivateError::UriTooLong);

    // Validate auditor key is not all zeros
    require!(
        params.auditor_elgamal_pubkey != [0u8; 32],
        SSSPrivateError::InvalidAuditorKey
    );

    let state = &mut ctx.accounts.state;
    let clock = Clock::get()?;

    // Initialize state
    state.authority = ctx.accounts.authority.key();
    state.mint = ctx.accounts.mint.key();
    state.name = params.name.clone();
    state.symbol = params.symbol.clone();
    state.uri = params.uri;
    state.decimals = params.decimals;
    state.auditor_elgamal_pubkey = params.auditor_elgamal_pubkey;
    state.auto_approve = false;
    state.allowlist_count = 0;
    state.total_deposited_confidential = 0;
    state.total_withdrawn_confidential = 0;
    state.paused = false;
    state.total_minted = 0;
    state.total_burned = 0;
    state.has_permanent_delegate = params.enable_permanent_delegate;
    state.has_transfer_hook = params.enable_transfer_hook;
    state.pending_authority = None;
    state.bump = ctx.bumps.state;

    // NOTE: In production, this is where we would:
    // 1. Calculate required space for mint with extensions
    // 2. Create the mint account with extra space for:
    //    - ConfidentialTransferMint extension
    //    - MetadataPointer extension
    //    - MintCloseAuthority extension
    //    - Optional: PermanentDelegate, TransferHook
    // 3. Initialize ConfidentialTransferMint with:
    //    - authority = state PDA
    //    - auto_approve_new_accounts = false
    //    - auditor_elgamal_pubkey = params.auditor_elgamal_pubkey
    //
    // The SPL ConfidentialTransfer CPI calls require:
    //   spl_token_2022::extension::confidential_transfer::instruction::initialize_mint(...)
    //
    // This is gated on the solana-zk-sdk being stable and the
    // ConfidentialTransfer extension being fully supported in Anchor.

    msg!("SSS-3: Initialized private stablecoin '{}' ({})", params.name, params.symbol);
    msg!("SSS-3: Auditor ElGamal key set, auto_approve=false");

    emit!(InitializePrivateEvent {
        state: state.key(),
        mint: ctx.accounts.mint.key(),
        authority: ctx.accounts.authority.key(),
        name: params.name,
        symbol: params.symbol,
        decimals: params.decimals,
        auditor_elgamal_pubkey: params.auditor_elgamal_pubkey,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
