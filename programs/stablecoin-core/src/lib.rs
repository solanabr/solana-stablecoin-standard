use anchor_lang::prelude::*;

declare_id!("Dns9MwXRed9RQxaw3ED4PUn7FC9bm2CynPFpzx6eTCFh");

#[program]
pub mod stablecoin_core {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Stablecoin initialized - placeholder");
        Ok(())
    }

    pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()> {
        msg!("Mint {} tokens - placeholder", amount);
        Ok(())
    }

    pub fn burn(ctx: Context<Burn>, amount: u64) -> Result<()> {
        msg!("Burn {} tokens - placeholder", amount);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Mint<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,
}

#[derive(Accounts)]
pub struct Burn<'info> {
    #[account(mut)]
    pub burner: Signer<'info>,
}
