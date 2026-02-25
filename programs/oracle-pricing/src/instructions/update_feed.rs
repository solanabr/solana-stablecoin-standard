use anchor_lang::prelude::*;
use crate::state::PriceFeedConfig;

#[derive(Accounts)]
pub struct UpdateFeed<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority,
    )]
    pub price_feed_config: Account<'info, PriceFeedConfig>,

    /// New Switchboard aggregator account (optional — pass the same if unchanged)
    /// CHECK: validated when reading price, not at update time
    pub feed: UncheckedAccount<'info>,
}

pub fn handle_update_feed(
    ctx: Context<UpdateFeed>,
    pair_name: Option<String>,
    feed_decimals: Option<u8>,
    stale_after_secs: Option<i64>,
) -> Result<()> {
    let config = &mut ctx.accounts.price_feed_config;
    config.feed = ctx.accounts.feed.key();

    if let Some(name) = pair_name {
        config.pair_name = name;
    }
    if let Some(d) = feed_decimals {
        config.feed_decimals = d;
    }
    if let Some(s) = stale_after_secs {
        config.stale_after_secs = s;
    }

    msg!("Oracle feed updated for mint {}", config.mint);
    Ok(())
}
