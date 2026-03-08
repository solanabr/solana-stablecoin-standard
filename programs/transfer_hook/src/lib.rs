use anchor_lang::prelude::*;

declare_id!("4ucEBHqsBE499rmqYznkKdUr7ruEVDpCi2n6v4xdDao1");

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
