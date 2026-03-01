use anchor_lang::prelude::*;

declare_id!("8ZgCmpHScgGYFzv6Xo9XT1KUsb7rcM99seQmPsc3H3v5");

#[program]
pub mod sss_temp {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
