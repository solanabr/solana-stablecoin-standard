use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::*;
use crate::errors::SssError;

// =============================================================================
// BANKING RAILS: FIAT -> STABLECOIN (MINT FROM BANK DEPOSIT)
// =============================================================================

/// Step 1: Create a mint request after bank deposit is initiated
/// Called by authorized minter when they receive wire transfer notification
pub fn create_mint_request_handler(
    ctx: Context<CreateMintRequest>,
    params: MintFromBankParams,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.is_paused, SssError::Paused);
    require!(
        config.banking_rail != BankingRail::None,
        SssError::BankingRailNotConfigured
    );

    let mint_request = &mut ctx.accounts.mint_request;
    mint_request.stablecoin = config.key();
    mint_request.depositor = ctx.accounts.depositor.key();
    mint_request.recipient = ctx.accounts.recipient.key();
    mint_request.amount = params.amount;
    mint_request.fiat_amount = params.fiat_amount;
    mint_request.fiat_currency = params.fiat_currency;
    mint_request.banking_rail = config.banking_rail;
    mint_request.reference_id = params.reference_id;
    mint_request.status = MintRequestStatus::Pending;
    mint_request.created_at = Clock::get()?.unix_timestamp;
    mint_request.confirmed_at = 0;
    mint_request.bump = ctx.bumps.mint_request;

    msg!(
        "Mint request created: {} tokens for {} | Wire ref: {:?}",
        params.amount,
        ctx.accounts.recipient.key(),
        &params.reference_id[..8]
    );

    Ok(())
}

/// Step 2: Confirm bank deposit and mint stablecoins
/// Called by authorized minter after bank confirms the deposit
pub fn confirm_and_mint_handler(ctx: Context<ConfirmAndMint>) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.is_paused, SssError::Paused);

    let mint_request = &mut ctx.accounts.mint_request;
    require!(
        mint_request.status == MintRequestStatus::Pending,
        SssError::InvalidMintRequestStatus
    );

    let roles = &ctx.accounts.roles;
    require!(roles.is_minter, SssError::NotMinter);

    let now = Clock::get()?.unix_timestamp;
    mint_request.status = MintRequestStatus::Confirmed;
    mint_request.confirmed_at = now;

    // mint the tokens
    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[b"config", mint_key.as_ref(), &[config.bump]];
    let signer_seeds = &[seeds];

    anchor_spl::token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_2022::MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_ata.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        mint_request.amount,
    )?;

    mint_request.status = MintRequestStatus::Minted;

    // update supply tracking
    let config = &mut ctx.accounts.config;
    config.total_minted = config.total_minted.saturating_add(mint_request.amount);

    msg!(
        "Bank deposit confirmed & minted: {} tokens | Rail: {:?}",
        mint_request.amount,
        mint_request.banking_rail
    );

    Ok(())
}

// =============================================================================
// BANKING RAILS: STABLECOIN -> FIAT (REDEEM TO BANK)
// =============================================================================

/// Step 1: Burn tokens and create redemption request
/// User burns stablecoins and provides bank details hash
pub fn create_redemption_handler(
    ctx: Context<CreateRedemption>,
    params: RedeemToBankParams,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.is_paused, SssError::Paused);
    require!(
        config.banking_rail != BankingRail::None,
        SssError::BankingRailNotConfigured
    );

    // burn the tokens first
    anchor_spl::token_2022::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_2022::Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.redeemer_ata.to_account_info(),
                authority: ctx.accounts.redeemer.to_account_info(),
            },
        ),
        params.amount,
    )?;

    let redemption = &mut ctx.accounts.redemption_request;
    redemption.stablecoin = config.key();
    redemption.redeemer = ctx.accounts.redeemer.key();
    redemption.amount = params.amount;
    redemption.fiat_amount = params.amount; // 1:1 for fiat-backed
    redemption.fiat_currency = FiatCurrency::Usd; // default, can be extended
    redemption.banking_rail = config.banking_rail;
    redemption.bank_account_hash = params.bank_account_hash;
    redemption.status = RedemptionStatus::Requested;
    redemption.created_at = Clock::get()?.unix_timestamp;
    redemption.completed_at = 0;
    redemption.wire_reference = [0u8; 32];
    redemption.bump = ctx.bumps.redemption_request;

    // update supply tracking
    let config = &mut ctx.accounts.config;
    config.total_burned = config.total_burned.saturating_add(params.amount);

    msg!(
        "Redemption requested: {} tokens burned | Awaiting wire transfer",
        params.amount
    );

    Ok(())
}

/// Step 2: Mark redemption as completed after wire is sent
/// Called by authorized operator after bank confirms wire sent
pub fn complete_redemption_handler(
    ctx: Context<CompleteRedemption>,
    wire_reference: [u8; 32],
) -> Result<()> {
    let redemption = &mut ctx.accounts.redemption_request;
    require!(
        redemption.status == RedemptionStatus::Requested 
            || redemption.status == RedemptionStatus::Processing,
        SssError::InvalidRedemptionStatus
    );

    redemption.status = RedemptionStatus::Completed;
    redemption.completed_at = Clock::get()?.unix_timestamp;
    redemption.wire_reference = wire_reference;

    msg!(
        "Redemption completed: {} fiat sent | Wire ref: {:?}",
        redemption.fiat_amount,
        &wire_reference[..8]
    );

    Ok(())
}

// =============================================================================
// RESERVE ATTESTATION
// =============================================================================

/// Submit proof-of-reserves attestation from oracle/auditor
pub fn submit_attestation_handler(
    ctx: Context<SubmitAttestation>,
    total_reserves: u64,
    valid_for_seconds: i64,
    ipfs_hash: [u8; 32],
) -> Result<()> {
    let config = &ctx.accounts.config;
    let now = Clock::get()?.unix_timestamp;

    let attestation = &mut ctx.accounts.attestation;
    attestation.stablecoin = config.key();
    attestation.attester = ctx.accounts.attester.key();
    attestation.total_reserves = total_reserves;
    attestation.total_supply = config.current_supply();
    
    // calculate backing ratio in basis points
    if attestation.total_supply > 0 {
        attestation.backing_ratio = ((total_reserves as u128 * 10000) 
            / attestation.total_supply as u128) as u16;
    } else {
        attestation.backing_ratio = 10000; // 100% if no supply
    }
    
    attestation.backing_type = config.backing_type;
    attestation.timestamp = now;
    attestation.valid_until = now + valid_for_seconds;
    attestation.ipfs_hash = ipfs_hash;
    attestation.bump = ctx.bumps.attestation;

    msg!(
        "Reserve attestation submitted: {} reserves / {} supply = {}% backed",
        total_reserves,
        attestation.total_supply,
        attestation.backing_ratio / 100
    );

    Ok(())
}

// =============================================================================
// ACCOUNT CONTEXTS
// =============================================================================

#[derive(Accounts)]
#[instruction(params: MintFromBankParams)]
pub struct CreateMintRequest<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    /// CHECK: depositor who sent the wire
    pub depositor: UncheckedAccount<'info>,

    /// CHECK: recipient of minted tokens
    pub recipient: UncheckedAccount<'info>,

    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [b"roles", config.key().as_ref(), minter.key().as_ref()],
        bump = roles.bump,
        constraint = roles.is_minter @ SssError::NotMinter
    )]
    pub roles: Account<'info, RolesConfig>,

    #[account(
        init,
        payer = minter,
        space = MintRequest::SPACE,
        seeds = [b"mint_request", config.key().as_ref(), &params.reference_id],
        bump,
    )]
    pub mint_request: Account<'info, MintRequest>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConfirmAndMint<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [b"roles", config.key().as_ref(), minter.key().as_ref()],
        bump = roles.bump,
    )]
    pub roles: Account<'info, RolesConfig>,

    #[account(
        mut,
        seeds = [b"mint_request", config.key().as_ref(), &mint_request.reference_id],
        bump = mint_request.bump,
    )]
    pub mint_request: Account<'info, MintRequest>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = mint_request.recipient,
        associated_token::token_program = token_program,
    )]
    pub recipient_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(params: RedeemToBankParams)]
pub struct CreateRedemption<'info> {
    #[account(mut)]
    pub redeemer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = redeemer,
        associated_token::token_program = token_program,
    )]
    pub redeemer_ata: InterfaceAccount<'info, TokenAccount>,

    /// Use amount + bank_hash as unique seed (one redemption per amount+destination combo)
    #[account(
        init,
        payer = redeemer,
        space = RedemptionRequest::SPACE,
        seeds = [b"redemption", config.key().as_ref(), redeemer.key().as_ref(), &params.amount.to_le_bytes()],
        bump,
    )]
    pub redemption_request: Account<'info, RedemptionRequest>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CompleteRedemption<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"roles", config.key().as_ref(), operator.key().as_ref()],
        bump = roles.bump,
        constraint = roles.is_minter @ SssError::NotMinter // minters can process redemptions
    )]
    pub roles: Account<'info, RolesConfig>,

    #[account(mut)]
    pub redemption_request: Account<'info, RedemptionRequest>,
}

#[derive(Accounts)]
#[instruction(total_reserves: u64, valid_for_seconds: i64, ipfs_hash: [u8; 32])]
pub struct SubmitAttestation<'info> {
    #[account(mut)]
    pub attester: Signer<'info>,

    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
        constraint = config.oracle == Some(attester.key()) @ SssError::NotOracle
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Use total_supply snapshot as unique seed per attestation
    #[account(
        init,
        payer = attester,
        space = ReserveAttestation::SPACE,
        seeds = [b"attestation", config.key().as_ref(), &total_reserves.to_le_bytes()],
        bump,
    )]
    pub attestation: Account<'info, ReserveAttestation>,

    pub system_program: Program<'info, System>,
}
