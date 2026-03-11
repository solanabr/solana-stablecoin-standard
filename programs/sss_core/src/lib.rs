use anchor_lang::prelude::*;
use instructions::*;

pub mod state;
pub mod error;
pub mod events;
pub mod instructions;



declare_id!("451UiDzutoMvqZkEj94PSNQTZELV4JqWRdiSoiJB9bxp");

#[program]
pub mod sss_core {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        decimals: u8,
        enable_permanent_delegate: bool,
        enable_transfer_hook: bool,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        process_initialize(ctx, decimals, enable_permanent_delegate, enable_transfer_hook, name, symbol, uri)
    }

    pub fn mint_token(ctx: Context<MintToken>, amount: u64) -> Result<()> {
        process_mint(ctx, amount)
    }

    pub fn burn_token(ctx: Context<BurnToken>, amount: u64) -> Result<()> {
        process_burn(ctx, amount)
    }

    pub fn seize_tokens<'info>(ctx: Context<'_, '_, '_, 'info, SeizeTokens<'info>>, amount: u64) -> Result<()> {
        process_seize(ctx, amount)
    }
}