use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;
pub mod switchboard;

use instructions::*;

declare_id!("62W3YccPPBB7W1RG6CEsXRPrujRvZMhZREHz6BtPnV7w");

#[program]
pub mod oracle_pricing {
    use super::*;

    pub fn initialize_feed(
        ctx: Context<InitializeFeed>,
        pair_name: String,
        feed_decimals: u8,
        stale_after_secs: i64,
    ) -> Result<()> {
        instructions::initialize_feed::handle_initialize_feed(ctx, pair_name, feed_decimals, stale_after_secs)
    }

    pub fn update_feed(
        ctx: Context<UpdateFeed>,
        pair_name: Option<String>,
        feed_decimals: Option<u8>,
        stale_after_secs: Option<i64>,
    ) -> Result<()> {
        instructions::update_feed::handle_update_feed(ctx, pair_name, feed_decimals, stale_after_secs)
    }

    pub fn get_price(ctx: Context<GetPrice>) -> Result<()> {
        instructions::get_price::handle_get_price(ctx)
    }
}
