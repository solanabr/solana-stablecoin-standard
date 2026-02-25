use anchor_lang::prelude::*;
use crate::state::PriceFeedConfig;

#[derive(Accounts)]
pub struct InitializeFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The stablecoin mint this feed will price
    /// CHECK: we only store the key, no data read
    pub mint: UncheckedAccount<'info>,

    /// Switchboard aggregator account
    /// CHECK: validated when reading price, not at init time
    pub feed: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = PriceFeedConfig::SIZE,
        seeds = [b"price_feed", mint.key().as_ref()],
        bump,
    )]
    pub price_feed_config: Account<'info, PriceFeedConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_feed(
    ctx: Context<InitializeFeed>,
    pair_name: String,
    feed_decimals: u8,
    stale_after_secs: i64,
) -> Result<()> {
    let config = &mut ctx.accounts.price_feed_config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.feed = ctx.accounts.feed.key();
    config.pair_name = pair_name;
    config.feed_decimals = feed_decimals;
    config.stale_after_secs = stale_after_secs;
    config.bump = ctx.bumps.price_feed_config;

    msg!("Oracle feed initialized for mint {}", config.mint);
    Ok(())
}
