use anchor_lang::prelude::*;
use crate::state::OracleConfig;
use crate::errors::OracleError;
use crate::events::{OracleConfigCreatedEvent, OracleFeedUpdatedEvent, OracleToggledEvent};

// ─── Create Oracle Config ────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateOracleParams {
    pub feed_address: Pubkey,
    pub base_currency: String,
    pub max_staleness: i64,
    pub max_confidence_bps: u64,
    /// Reference value for CPI-indexed stablecoins (0 for forex feeds)
    pub reference_value: u64,
}

#[derive(Accounts)]
pub struct CreateOracleConfig<'info> {
    /// Authority creating the oracle config
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The SSS-1/SSS-2 stablecoin state PDA
    /// CHECK: We store the key; the oracle_gated_mint/burn instructions validate via CPI
    pub stablecoin_state: UncheckedAccount<'info>,

    /// The stablecoin mint
    /// CHECK: Stored for reference
    pub mint: UncheckedAccount<'info>,

    /// The oracle config PDA
    #[account(
        init,
        payer = authority,
        space = OracleConfig::SIZE,
        seeds = [b"oracle-config", stablecoin_state.key().as_ref()],
        bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    pub system_program: Program<'info, System>,
}

pub fn create_handler(ctx: Context<CreateOracleConfig>, params: CreateOracleParams) -> Result<()> {
    require!(params.base_currency.len() <= 8, OracleError::CurrencyTooLong);
    require!(params.max_staleness > 0, OracleError::ZeroAmount);

    let clock = Clock::get()?;
    let config = &mut ctx.accounts.oracle_config;

    config.authority = ctx.accounts.authority.key();
    config.stablecoin_state = ctx.accounts.stablecoin_state.key();
    config.mint = ctx.accounts.mint.key();
    config.feed_address = params.feed_address;
    config.base_currency = params.base_currency.clone();
    config.max_staleness = params.max_staleness;
    config.max_confidence_bps = params.max_confidence_bps;
    config.enabled = true;
    config.reference_value = params.reference_value;
    config.last_price = 0;
    config.last_read_at = 0;
    config.total_oracle_mints = 0;
    config.total_oracle_burns = 0;
    config.bump = ctx.bumps.oracle_config;

    msg!(
        "Oracle: Created config for {} feed ({})",
        params.base_currency,
        params.feed_address
    );

    emit!(OracleConfigCreatedEvent {
        config: config.key(),
        stablecoin_state: ctx.accounts.stablecoin_state.key(),
        feed_address: params.feed_address,
        base_currency: params.base_currency,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Update Feed ─────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct UpdateFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ OracleError::Unauthorized,
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

pub fn update_feed_handler(ctx: Context<UpdateFeed>, new_feed: Pubkey) -> Result<()> {
    let clock = Clock::get()?;
    let config = &mut ctx.accounts.oracle_config;
    let old_feed = config.feed_address;

    config.feed_address = new_feed;
    config.last_price = 0; // Reset cached price
    config.last_read_at = 0;

    msg!("Oracle: Updated feed from {} to {}", old_feed, new_feed);

    emit!(OracleFeedUpdatedEvent {
        config: config.key(),
        old_feed,
        new_feed,
        updated_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Toggle Oracle ───────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ToggleOracle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ OracleError::Unauthorized,
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

pub fn toggle_handler(ctx: Context<ToggleOracle>, enabled: bool) -> Result<()> {
    let clock = Clock::get()?;
    ctx.accounts.oracle_config.enabled = enabled;

    msg!("Oracle: Toggled to enabled={}", enabled);

    emit!(OracleToggledEvent {
        config: ctx.accounts.oracle_config.key(),
        enabled,
        toggled_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
