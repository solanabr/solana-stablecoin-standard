use anchor_lang::prelude::*;
use instructions::*;
use crate::state::MockOracle;

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
        enable_confidential_transfers: bool,
        oracle_feed: Option<Pubkey>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        process_initialize(ctx, decimals, enable_permanent_delegate, enable_transfer_hook, enable_confidential_transfers, oracle_feed, name, symbol, uri)
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

    pub fn update_mock_oracle(ctx: Context<UpdateMockOracle>, price: u64, decimals: u8) -> Result<()> {
        let oracle = &mut ctx.accounts.oracle;
        oracle.price = price;
        oracle.decimals = decimals;
        msg!("Mock Oracle updated! Price: {}", price);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateMockOracle<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init_if_needed,
        payer = admin,
        space = crate::state::MockOracle::INIT_SPACE,
        seeds = [b"mock_oracle"],
        bump
    )]
    pub oracle: Account<'info, crate::state::MockOracle>,
    pub system_program: Program<'info, System>,
}