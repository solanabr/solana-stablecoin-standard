use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(mut)]
    pub current_master: Signer<'info>,

    #[account(
        mut,
        constraint = config.master_authority == current_master.key() @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn transfer_authority_handler(ctx: Context<TransferAuthority>, new_master: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.master_authority = new_master;
    Ok(())
}
