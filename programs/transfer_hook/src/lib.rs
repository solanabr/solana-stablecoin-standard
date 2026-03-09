use anchor_lang::prelude::*;

declare_id!("5cs7VzZny1XMj4TAJy2xVqo2tCHM8Vwe9bNbL6uRmbxk");

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
