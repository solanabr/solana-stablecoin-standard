//! SSS Oracle Module - Price feeds for non-USD stablecoin pegs
//!
//! Integrates Switchboard oracles for stablecoins pegged to EUR, BRL, CPI-indexed
//! assets, or other reference rates. Used by SSS-1/SSS-2 programs for mint/redeem pricing.

use anchor_lang::prelude::*;

mod switchboard;

#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "SSS Oracle - Solana Stablecoin Standard Oracle Module",
    project_url: "https://github.com/solanabr/solana-stablecoin-standard",
    contacts: "link:https://github.com/solanabr/solana-stablecoin-standard/issues",
    policy: "https://github.com/solanabr/solana-stablecoin-standard/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/solanabr/solana-stablecoin-standard",
    auditors: "Community review"
}

declare_id!("SSSQracXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz");

/// Oracle configuration for a stablecoin's price feed.
/// Seeds: ["oracle_config", stablecoin_config.key()]
#[account]
pub struct OracleConfig {
    /// The stablecoin config this oracle is attached to
    pub stablecoin: Pubkey,
    /// Authority who can update config and toggle
    pub authority: Pubkey,
    /// Switchboard aggregator feed address
    pub feed_address: Pubkey,
    /// Maximum allowed deviation from peg in basis points
    pub max_deviation_bps: u16,
    /// Maximum age of price in seconds before considered stale
    pub max_staleness_seconds: i64,
    /// Whether the oracle is active
    pub enabled: bool,
    /// PDA bump
    pub bump: u8,
}

impl OracleConfig {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 2 + 8 + 1 + 1;
}

pub const ORACLE_CONFIG_SEED: &[u8] = b"oracle_config";

/// Expected peg value for deviation calculation (1.0 = perfect peg)
pub const PEG_SCALE: i64 = 1_000_000_000;

#[program]
pub mod sss_oracle {
    use super::*;
    use crate::switchboard::{parse_switchboard_aggregator, SWITCHBOARD_PROGRAM_ID};

    /// Initialize oracle config for a stablecoin.
    pub fn initialize_oracle(
        ctx: Context<InitializeOracle>,
        feed_address: Pubkey,
        max_deviation_bps: u16,
        max_staleness_seconds: i64,
    ) -> Result<()> {
        require!(max_staleness_seconds > 0, SssOracleError::InvalidConfig);

        let config = &mut ctx.accounts.oracle_config;
        config.stablecoin = ctx.accounts.stablecoin_config.key();
        config.authority = ctx.accounts.authority.key();
        config.feed_address = feed_address;
        config.max_deviation_bps = max_deviation_bps;
        config.max_staleness_seconds = max_staleness_seconds;
        config.enabled = true;
        config.bump = ctx.bumps.oracle_config;

        emit!(OracleInitialized {
            stablecoin: config.stablecoin,
            feed_address: config.feed_address,
            max_deviation_bps: config.max_deviation_bps,
            max_staleness_seconds: config.max_staleness_seconds,
        });

        Ok(())
    }

    /// Update oracle settings. Authority only.
    pub fn update_oracle(
        ctx: Context<UpdateOracle>,
        feed_address: Option<Pubkey>,
        max_deviation_bps: Option<u16>,
        max_staleness_seconds: Option<i64>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.oracle_config;

        if let Some(addr) = feed_address {
            config.feed_address = addr;
        }
        if let Some(bps) = max_deviation_bps {
            config.max_deviation_bps = bps;
        }
        if let Some(secs) = max_staleness_seconds {
            require!(secs > 0, SssOracleError::InvalidConfig);
            config.max_staleness_seconds = secs;
        }

        emit!(OracleUpdated {
            stablecoin: config.stablecoin,
            feed_address: config.feed_address,
            max_deviation_bps: config.max_deviation_bps,
            max_staleness_seconds: config.max_staleness_seconds,
        });

        Ok(())
    }

    /// Toggle oracle on/off. Authority only.
    pub fn toggle_oracle(ctx: Context<ToggleOracle>, enabled: bool) -> Result<()> {
        ctx.accounts.oracle_config.enabled = enabled;
        Ok(())
    }

    /// Check price deviation from peg. Reads Switchboard feed, validates staleness,
    /// computes deviation in bps from expected peg (1.0), emits PriceChecked event.
    pub fn check_price_deviation(ctx: Context<CheckPriceDeviation>) -> Result<()> {
        let config = &ctx.accounts.oracle_config;

        require!(config.enabled, SssOracleError::OracleNotEnabled);
        require!(
            ctx.accounts.feed.key() == config.feed_address,
            SssOracleError::InvalidConfig
        );
        let feed_info = ctx.accounts.feed.to_account_info();
        require!(
            feed_info.owner == &SWITCHBOARD_PROGRAM_ID,
            SssOracleError::PriceFeedStale
        );

        let feed_data = ctx.accounts.feed.try_borrow_data()?;
        let (price_f64, round_timestamp) = parse_switchboard_aggregator(
            &feed_data,
            feed_info.owner,
        )
        .map_err(|_| SssOracleError::PriceFeedStale)?;

        let clock = Clock::get()?;
        let staleness = clock.unix_timestamp.saturating_sub(round_timestamp);
        require!(
            staleness <= config.max_staleness_seconds,
            SssOracleError::PriceFeedStale
        );

        let price_scaled = (price_f64 * PEG_SCALE as f64) as i64;

        let deviation_bps = if PEG_SCALE == 0 {
            0u16
        } else {
            let diff = (price_scaled - PEG_SCALE).abs();
            ((diff as u128)
                .saturating_mul(10_000)
                .saturating_div(PEG_SCALE as u128))
                .min(u16::MAX as u128) as u16
        };

        let within_bounds = deviation_bps <= config.max_deviation_bps;

        if !within_bounds {
            return Err(SssOracleError::PriceDeviationTooHigh.into());
        }

        emit!(PriceChecked {
            stablecoin: config.stablecoin,
            price: price_scaled,
            deviation_bps,
            within_bounds,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeOracle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The stablecoin config from the main SSS program
    pub stablecoin_config: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = OracleConfig::LEN,
        seeds = [ORACLE_CONFIG_SEED, stablecoin_config.key().as_ref()],
        bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOracle<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ORACLE_CONFIG_SEED, oracle_config.stablecoin.as_ref()],
        bump = oracle_config.bump,
        constraint = oracle_config.authority == authority.key() @ SssOracleError::Unauthorized
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

#[derive(Accounts)]
pub struct ToggleOracle<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ORACLE_CONFIG_SEED, oracle_config.stablecoin.as_ref()],
        bump = oracle_config.bump,
        constraint = oracle_config.authority == authority.key() @ SssOracleError::Unauthorized
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

#[derive(Accounts)]
pub struct CheckPriceDeviation<'info> {
    pub oracle_config: Account<'info, OracleConfig>,

    /// Switchboard aggregator feed - must match oracle_config.feed_address
    /// CHECK: Validated - must be owned by Switchboard program, layout verified in handler
    pub feed: UncheckedAccount<'info>,
}

#[event]
pub struct OracleInitialized {
    pub stablecoin: Pubkey,
    pub feed_address: Pubkey,
    pub max_deviation_bps: u16,
    pub max_staleness_seconds: i64,
}

#[event]
pub struct OracleUpdated {
    pub stablecoin: Pubkey,
    pub feed_address: Pubkey,
    pub max_deviation_bps: u16,
    pub max_staleness_seconds: i64,
}

#[event]
pub struct PriceChecked {
    pub stablecoin: Pubkey,
    pub price: i64,
    pub deviation_bps: u16,
    pub within_bounds: bool,
}

#[error_code]
pub enum SssOracleError {
    #[msg("Oracle is not enabled")]
    OracleNotEnabled,
    #[msg("Price feed is stale")]
    PriceFeedStale,
    #[msg("Price deviation too high")]
    PriceDeviationTooHigh,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid oracle config")]
    InvalidConfig,
}
