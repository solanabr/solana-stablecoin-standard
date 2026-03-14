use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::SupplyCapUpdated;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct SetSupplyCap<'info> {
    #[account(
        constraint = authority.key() == config.authority @ StablecoinError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

/// Set or update the supply cap. 0 = unlimited.
pub fn set_supply_cap_handler(
    ctx: Context<SetSupplyCap>,
    new_cap: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old_cap = config.supply_cap;

    // If setting a non-zero cap, ensure current supply doesn't exceed it
    if new_cap > 0 {
        let current_supply = config.current_supply();
        require!(current_supply <= new_cap, StablecoinError::SupplyCapExceeded);
    }

    config.supply_cap = new_cap;

    emit!(SupplyCapUpdated {
        config: config.key(),
        old_cap,
        new_cap,
    });

    Ok(())
}
