use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;
use crate::state::BlacklistRecord;
use crate::error::TransferHookError;

#[derive(Accounts)]
pub struct Execute<'info> {
    #[account()]
    pub source_account: InterfaceAccount<'info, TokenAccount>,
    #[account()]
    pub destination_account: InterfaceAccount<'info, TokenAccount>,
}

pub fn process_execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
    let source_owner = ctx.accounts.source_account.owner;
    let dest_owner = ctx.accounts.destination_account.owner;

    // Проверяем отправителя
    let (source_pda, _) = Pubkey::find_program_address(
        &[BlacklistRecord::SEED, source_owner.as_ref()],
        ctx.program_id,
    );
    
    // Если аккаунт существует, значит он в блэклисте
    if ctx.remaining_accounts.iter().any(|acc| acc.key() == source_pda) {
        return err!(TransferHookError::WalletBlacklisted);
    }

    // Проверяем получателя
    let (dest_pda, _) = Pubkey::find_program_address(
        &[BlacklistRecord::SEED, dest_owner.as_ref()],
        ctx.program_id,
    );
    
    if ctx.remaining_accounts.iter().any(|acc| acc.key() == dest_pda) {
        return err!(TransferHookError::WalletBlacklisted);
    }

    Ok(())
}