use anchor_lang::prelude::*;

declare_id!("BzKd12nujUa9hejZJVSKXF8QHivBJu2XoqfXqMF5Ls3P");

/// SSS Oracle Integration Module (Experimental)
/// Demonstrates how an external Switchboard feed can control Minting pricing equations.
#[program]
pub mod oracle_module {
    use super::*;

    pub fn initialize_feed(_ctx: Context<InitializeFeed>) -> Result<()> {
        msg!("Switchboard Oracle Feed initialized for SSS.");
        Ok(())
    }

    pub fn mint_with_oracle_price(_ctx: Context<MintWithPrice>, fiat_deposit: u64) -> Result<()> {
        // In a real integration:
        // let feed = &ctx.accounts.switchboard_feed;
        // let price = feed.get_result()?;
        
        let mocked_price: f64 = 1.05; // 1 EUR = 1.05 USD for a Euro-pegged stablecoin
        let tokens_to_mint = (fiat_deposit as f64 / mocked_price) as u64;

        msg!("Fiat Deposit: {}", fiat_deposit);
        msg!("Oracle Price: {}", mocked_price);
        msg!("Minting {} tokens based on feed...", tokens_to_mint);

        // Normally, a CPI wrapper to `sss::cpi::mint_token` would execute here,
        // passing the `tokens_to_mint` determined purely by the oracle.
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeFeed<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintWithPrice<'info> {
    pub minter: Signer<'info>,
    
    /// CHECK: The SSS config constraint handled via CPI
    pub config: AccountInfo<'info>,
    
    /// CHECK: Switchboard Feed Account
    pub switchboard_feed: AccountInfo<'info>,
}
