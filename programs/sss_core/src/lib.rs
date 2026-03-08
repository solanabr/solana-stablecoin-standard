use anchor_lang::prelude::*;

declare_id!("5DS5SuAc1eCHmmb2jXHNYrLWGZee8LKX6qYD7vP5EjRg");

#[program]
pub mod sss_core {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
