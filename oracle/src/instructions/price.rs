use anchor_lang::prelude::*;
use crate::state::{OracleConfig, PriceData};
use crate::errors::OracleError;
use crate::events::{PriceReadEvent, OracleGatedMintEvent, OracleGatedBurnEvent};

// ─── Read Price ──────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ReadPrice<'info> {
    /// The oracle config
    pub oracle_config: Account<'info, OracleConfig>,

    /// The Switchboard V2 aggregator account
    /// CHECK: Validated against oracle_config.feed_address
    pub feed: UncheckedAccount<'info>,
}

/// Parse price data from a Switchboard V2 feed account.
///
/// In production this would use the `switchboard-solana` crate:
/// ```ignore
/// use switchboard_solana::AggregatorAccountData;
/// let feed = AggregatorAccountData::new(feed_account_info)?;
/// let result = feed.get_result()?;
/// ```
///
/// For this PoC, we demonstrate the interface and validation logic.
fn parse_switchboard_feed(
    _feed_info: &AccountInfo,
    config: &OracleConfig,
) -> Result<PriceData> {
    let clock = Clock::get()?;

    // ──────────────────────────────────────────────────────────
    // NOTE: Production implementation would:
    //
    // 1. Deserialize the Switchboard V2 AggregatorAccountData
    //    let feed = AggregatorAccountData::new(feed_info)?;
    //
    // 2. Get the latest result
    //    let result = feed.get_result()?;
    //    let value = result.try_into_f64()?;
    //
    // 3. Get the latest confirmed round
    //    let round = feed.latest_confirmed_round;
    //    let timestamp = round.round_open_timestamp;
    //    let num_success = round.num_success;
    //
    // 4. Convert to our scaled integer format (8 decimals)
    //    let price_scaled = (value * PriceData::SCALE as f64) as u64;
    //
    // For this PoC, we return a mock price to demonstrate the flow.
    // ──────────────────────────────────────────────────────────

    let mock_price = match config.base_currency.as_str() {
        "EUR" => 108_000_000u64,  // EUR/USD = 1.08
        "GBP" => 127_000_000,     // GBP/USD = 1.27
        "BRL" =>  20_000_000,     // BRL/USD = 0.20
        "JPY" =>     670_000,     // JPY/USD = 0.0067
        "CPI" => 100_000_000,     // CPI index = 1.00 (reference)
        _     => 100_000_000,     // Default 1:1
    };

    let price_data = PriceData {
        value: mock_price,
        confidence: 100_000,       // 0.001 (0.1% spread)
        timestamp: clock.unix_timestamp,
        num_oracles: 10,
    };

    // Validate staleness
    let age = clock.unix_timestamp.saturating_sub(price_data.timestamp);
    require!(age <= config.max_staleness, OracleError::StaleFeed);

    // Validate confidence interval
    // confidence_bps = (confidence / value) * 10000
    if price_data.value > 0 {
        let confidence_bps = price_data
            .confidence
            .checked_mul(10_000)
            .ok_or(OracleError::ArithmeticOverflow)?
            .checked_div(price_data.value)
            .ok_or(OracleError::ArithmeticOverflow)?;
        require!(
            confidence_bps <= config.max_confidence_bps,
            OracleError::ConfidenceTooWide
        );
    }

    require!(price_data.value > 0, OracleError::InvalidPrice);

    Ok(price_data)
}

pub fn read_handler(ctx: Context<ReadPrice>) -> Result<()> {
    let config = &ctx.accounts.oracle_config;
    require!(config.enabled, OracleError::OracleDisabled);

    // Validate feed address matches config
    require!(
        ctx.accounts.feed.key() == config.feed_address,
        OracleError::InvalidFeed
    );

    let price_data = parse_switchboard_feed(&ctx.accounts.feed, config)?;

    msg!(
        "Oracle: {}/USD = {}.{:08} (confidence: {}.{:08}, {} oracles)",
        config.base_currency,
        price_data.value / PriceData::SCALE,
        price_data.value % PriceData::SCALE,
        price_data.confidence / PriceData::SCALE,
        price_data.confidence % PriceData::SCALE,
        price_data.num_oracles,
    );

    emit!(PriceReadEvent {
        config: config.key(),
        price: price_data.value,
        confidence: price_data.confidence,
        feed_timestamp: price_data.timestamp,
        read_timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ─── Oracle-Gated Mint ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct OracleGatedMint<'info> {
    /// Minter authority
    #[account(mut)]
    pub minter: Signer<'info>,

    /// Oracle configuration
    #[account(
        mut,
        constraint = oracle_config.enabled @ OracleError::OracleDisabled,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    /// Switchboard V2 aggregator
    /// CHECK: Validated against oracle_config.feed_address
    #[account(
        constraint = feed.key() == oracle_config.feed_address @ OracleError::InvalidFeed,
    )]
    pub feed: UncheckedAccount<'info>,

    /// The SSS stablecoin state PDA
    /// CHECK: Validated against oracle_config.stablecoin_state
    #[account(
        constraint = stablecoin_state.key() == oracle_config.stablecoin_state @ OracleError::StateMismatch,
    )]
    pub stablecoin_state: UncheckedAccount<'info>,

    /// The stablecoin mint
    /// CHECK: Validated against oracle_config.mint
    #[account(
        mut,
        constraint = mint.key() == oracle_config.mint @ OracleError::StateMismatch,
    )]
    pub mint: UncheckedAccount<'info>,

    /// The recipient's token account
    /// CHECK: Validated via CPI to SSS program
    #[account(mut)]
    pub recipient_token_account: UncheckedAccount<'info>,

    /// SSS Token program (for CPI)
    /// CHECK: Program ID validated at instruction level
    pub sss_program: UncheckedAccount<'info>,

    /// Token-2022 program
    pub token_program: Program<'info, anchor_spl::token_2022::Token2022>,

    pub system_program: Program<'info, System>,
}

pub fn oracle_mint_handler(ctx: Context<OracleGatedMint>, base_amount: u64) -> Result<()> {
    require!(base_amount > 0, OracleError::ZeroAmount);

    let config = &ctx.accounts.oracle_config;
    let price_data = parse_switchboard_feed(&ctx.accounts.feed, config)?;

    // Calculate USD-equivalent tokens to mint:
    // tokens = base_amount × (price / 10^8)
    // To avoid floating point: tokens = base_amount × price / SCALE
    let tokens_to_mint = (base_amount as u128)
        .checked_mul(price_data.value as u128)
        .ok_or(OracleError::ArithmeticOverflow)?
        .checked_div(PriceData::SCALE as u128)
        .ok_or(OracleError::ArithmeticOverflow)? as u64;

    require!(tokens_to_mint > 0, OracleError::ZeroAmount);

    // Update config stats
    let config = &mut ctx.accounts.oracle_config;
    config.last_price = price_data.value;
    config.last_read_at = price_data.timestamp;
    config.total_oracle_mints = config.total_oracle_mints.checked_add(1).unwrap();

    // NOTE: In production, this would CPI into the SSS-1 program:
    //
    // sss_token::cpi::mint_tokens(
    //     CpiContext::new_with_signer(
    //         ctx.accounts.sss_program.to_account_info(),
    //         sss_token::cpi::accounts::MintTokens { ... },
    //         &[&seeds],
    //     ),
    //     tokens_to_mint,
    // )?;
    //
    // The oracle module would need to be registered as a minter
    // in the SSS-1 program with sufficient quota.

    let clock = Clock::get()?;

    msg!(
        "Oracle: Minting {} tokens for {} {} (rate: {}.{:08})",
        tokens_to_mint,
        base_amount,
        config.base_currency,
        price_data.value / PriceData::SCALE,
        price_data.value % PriceData::SCALE,
    );

    emit!(OracleGatedMintEvent {
        config: config.key(),
        recipient: ctx.accounts.recipient_token_account.key(),
        base_amount,
        exchange_rate: price_data.value,
        tokens_minted: tokens_to_mint,
        base_currency: config.base_currency.clone(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Oracle-Gated Burn ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct OracleGatedBurn<'info> {
    /// Token owner/burner
    #[account(mut)]
    pub burner: Signer<'info>,

    /// Oracle configuration
    #[account(
        mut,
        constraint = oracle_config.enabled @ OracleError::OracleDisabled,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    /// Switchboard V2 aggregator
    /// CHECK: Validated against oracle_config.feed_address
    #[account(
        constraint = feed.key() == oracle_config.feed_address @ OracleError::InvalidFeed,
    )]
    pub feed: UncheckedAccount<'info>,

    /// The SSS stablecoin state
    /// CHECK: Validated against oracle_config.stablecoin_state
    #[account(
        constraint = stablecoin_state.key() == oracle_config.stablecoin_state @ OracleError::StateMismatch,
    )]
    pub stablecoin_state: UncheckedAccount<'info>,

    /// The stablecoin mint
    /// CHECK: Validated against oracle_config.mint
    #[account(
        mut,
        constraint = mint.key() == oracle_config.mint @ OracleError::StateMismatch,
    )]
    pub mint: UncheckedAccount<'info>,

    /// The burner's token account
    /// CHECK: Validated via CPI
    #[account(mut)]
    pub burner_token_account: UncheckedAccount<'info>,

    /// Token-2022 program
    pub token_program: Program<'info, anchor_spl::token_2022::Token2022>,
}

pub fn oracle_burn_handler(ctx: Context<OracleGatedBurn>, token_amount: u64) -> Result<()> {
    require!(token_amount > 0, OracleError::ZeroAmount);

    let config = &ctx.accounts.oracle_config;
    let price_data = parse_switchboard_feed(&ctx.accounts.feed, config)?;

    // Calculate base currency value:
    // base_value = token_amount × SCALE / price
    let base_value = (token_amount as u128)
        .checked_mul(PriceData::SCALE as u128)
        .ok_or(OracleError::ArithmeticOverflow)?
        .checked_div(price_data.value as u128)
        .ok_or(OracleError::ArithmeticOverflow)? as u64;

    // Update config stats
    let config = &mut ctx.accounts.oracle_config;
    config.last_price = price_data.value;
    config.last_read_at = price_data.timestamp;
    config.total_oracle_burns = config.total_oracle_burns.checked_add(1).unwrap();

    // NOTE: In production, this would CPI into the SSS-1 program:
    // sss_token::cpi::burn_tokens(ctx, token_amount)?;

    let clock = Clock::get()?;

    msg!(
        "Oracle: Burning {} tokens = {} {} (rate: {}.{:08})",
        token_amount,
        base_value,
        config.base_currency,
        price_data.value / PriceData::SCALE,
        price_data.value % PriceData::SCALE,
    );

    emit!(OracleGatedBurnEvent {
        config: config.key(),
        burner: ctx.accounts.burner.key(),
        token_amount,
        exchange_rate: price_data.value,
        base_value,
        base_currency: config.base_currency.clone(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
