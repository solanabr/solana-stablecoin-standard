use anchor_lang::prelude::*;
use crate::state::PriceFeedConfig;
use crate::switchboard;
use crate::error::OracleError;

#[derive(Accounts)]
pub struct GetPrice<'info> {
    #[account(
        has_one = feed,
    )]
    pub price_feed_config: Account<'info, PriceFeedConfig>,

    /// The Switchboard aggregator account
    /// CHECK: address validated by has_one = feed
    pub feed: UncheckedAccount<'info>,
}

#[event]
pub struct PriceRead {
    pub mint: Pubkey,
    pub pair_name: String,
    pub price: i64,
    pub decimals: u8,
    pub timestamp: i64,
}

pub fn handle_get_price(ctx: Context<GetPrice>) -> Result<()> {
    let config = &ctx.accounts.price_feed_config;
    let feed_data = ctx.accounts.feed.try_borrow_data()?;

    let price = switchboard::read_switchboard_price(&feed_data, config.feed_decimals)?;
    let feed_ts = switchboard::read_switchboard_timestamp(&feed_data)?;

    // Staleness check
    let clock = Clock::get()?;
    let age = clock.unix_timestamp.saturating_sub(feed_ts);
    require!(age <= config.stale_after_secs, OracleError::StaleFeedPrice);

    // Emit event with the read price
    emit!(PriceRead {
        mint: config.mint,
        pair_name: config.pair_name.clone(),
        price,
        decimals: config.feed_decimals,
        timestamp: feed_ts,
    });

    // Also set return data so callers can read the price via CPI
    let return_bytes = price.to_le_bytes();
    anchor_lang::solana_program::program::set_return_data(&return_bytes);

    msg!("Price for {}: {} ({}dp)", config.pair_name, price, config.feed_decimals);
    Ok(())
}
