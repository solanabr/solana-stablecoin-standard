use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod sss_base {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
