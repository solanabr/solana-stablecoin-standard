use anchor_lang::prelude::*;

declare_id!("E2fEodf97kX61uMpt6tWXKLCPxkQRn4oHa26ig85GND1");

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn execute(_ctx: Context<Execute>, amount: u64) -> Result<()> {
        msg!("Transfer hook: checking transfer of {} tokens", amount);
        msg!("Transfer approved");
        Ok(())
    }

    pub fn initialize_extra_account_meta_list(
        _ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        msg!("Extra account meta list initialized");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: Source account
    pub source: UncheckedAccount<'info>,
    /// CHECK: Mint account
    pub mint: UncheckedAccount<'info>,
    /// CHECK: Destination account
    pub destination: UncheckedAccount<'info>,
    /// CHECK: Authority
    pub authority: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Extra account meta list
    #[account(mut)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// CHECK: Mint
    pub mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
