use anchor_lang::prelude::*;

declare_id!("E2fEodf97kX61uMpt6tWXKLCPxkQRn4oHa26ig85GND1");

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        msg!("Transfer hook executed for {} tokens - placeholder", amount);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
}
