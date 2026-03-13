use anchor_lang::prelude::*;

declare_id!("27eVzSd6UBsLAzzXaSfMbUM5dgZLv4H8fiQTVqXkESFb");

/// Oracle Integration Module for Solana Stablecoin Standard
///
/// Provides oracle-based pricing for non-USD stablecoin pegs.
/// Uses Switchboard oracle feeds to determine exchange rates
/// for mint/redeem operations.
///
/// This is a SEPARATE program — it does not modify the token.
/// It's a pricing layer that sits alongside the main stablecoin program.
#[program]
pub mod oracle_module {
    use super::*;

    /// Initialize an oracle configuration for a stablecoin.
    pub fn initialize_oracle(
        ctx: Context<InitializeOracle>,
        base_currency: String,
        staleness_threshold: i64,
    ) -> Result<()> {
        let oracle_config = &mut ctx.accounts.oracle_config;
        oracle_config.authority = ctx.accounts.authority.key();
        oracle_config.stablecoin_config = ctx.accounts.stablecoin_config.key();
        oracle_config.feed_address = ctx.accounts.feed.key();
        oracle_config.base_currency = base_currency;
        oracle_config.staleness_threshold = staleness_threshold;
        oracle_config.bump = ctx.bumps.oracle_config;
        Ok(())
    }

    /// Update the oracle feed address.
    pub fn update_feed(ctx: Context<UpdateFeed>, new_feed: Pubkey) -> Result<()> {
        let oracle_config = &mut ctx.accounts.oracle_config;
        oracle_config.feed_address = new_feed;
        Ok(())
    }

    /// Get the current price from the oracle feed.
    /// Returns the price as a fixed-point number.
    pub fn get_price(_ctx: Context<GetPrice>) -> Result<()> {
        // TODO: Phase 7 — Switchboard integration
        // 1. Read the aggregator account
        // 2. Validate staleness
        // 3. Return the price
        Ok(())
    }

    /// Mint tokens with oracle-adjusted pricing.
    /// Calculates how many tokens to mint based on the current
    /// exchange rate from the oracle feed.
    pub fn mint_with_oracle_price(
        _ctx: Context<MintWithOracle>,
        _collateral_amount: u64,
    ) -> Result<()> {
        // TODO: Phase 7 — Full implementation
        Ok(())
    }

    /// Redeem tokens with oracle-adjusted pricing.
    pub fn redeem_with_oracle_price(
        _ctx: Context<RedeemWithOracle>,
        _token_amount: u64,
    ) -> Result<()> {
        // TODO: Phase 7 — Full implementation
        Ok(())
    }
}

/// Oracle configuration account.
///
/// PDA seeds: `[b"oracle", stablecoin_config.key()]`
#[account]
pub struct OracleConfig {
    /// Authority who can update the oracle config
    pub authority: Pubkey,
    /// Links to the SSS StablecoinConfig account
    pub stablecoin_config: Pubkey,
    /// Switchboard aggregator address
    pub feed_address: Pubkey,
    /// Base currency identifier (e.g., "EUR", "BRL", "CPI")
    pub base_currency: String,
    /// Maximum acceptable age of oracle data in seconds
    pub staleness_threshold: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl OracleConfig {
    pub const MAX_CURRENCY_LEN: usize = 10;

    pub const fn space() -> usize {
        8 +     // discriminator
        32 +    // authority
        32 +    // stablecoin_config
        32 +    // feed_address
        (4 + Self::MAX_CURRENCY_LEN) + // base_currency
        8 +     // staleness_threshold
        1 // bump
    }
}

#[derive(Accounts)]
pub struct InitializeOracle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = OracleConfig::space(),
        seeds = [b"oracle", stablecoin_config.key().as_ref()],
        bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    /// CHECK: The SSS StablecoinConfig account
    pub stablecoin_config: AccountInfo<'info>,

    /// CHECK: The Switchboard aggregator feed
    pub feed: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateFeed<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority,
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

#[derive(Accounts)]
pub struct GetPrice<'info> {
    pub oracle_config: Account<'info, OracleConfig>,

    /// CHECK: The Switchboard aggregator feed
    pub feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct MintWithOracle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub oracle_config: Account<'info, OracleConfig>,

    /// CHECK: The Switchboard aggregator feed
    pub feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RedeemWithOracle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub oracle_config: Account<'info, OracleConfig>,

    /// CHECK: The Switchboard aggregator feed
    pub feed: AccountInfo<'info>,
}
