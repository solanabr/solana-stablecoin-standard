use anchor_lang::prelude::*;
use crate::error::TransferHookError;

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Execute<'info> {
    // Делаем все 4 аккаунта Unchecked, чтобы они никогда не вызывали InvalidAccountData.
    // Валидацией этих аккаунтов занимается сам Token-2022, нам это дублировать не нужно.
    
    /// CHECK: Аккаунт отправителя
    #[account()]
    pub source_account: UncheckedAccount<'info>,

    /// CHECK: Минт токена
    #[account()]
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Аккаунт получателя
    #[account()]
    pub destination_account: UncheckedAccount<'info>,

    /// CHECK: Авторитет отправителя
    #[account()]
    pub owner_delegate: UncheckedAccount<'info>,

    /// CHECK: Программа дополнительной мета-информации
    pub extra_account_meta_list: UncheckedAccount<'info>,
}

pub fn process_execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
    // В remaining_accounts у нас лежат PDA блэклистов, которые мы передали из SDK
    
    for account in ctx.remaining_accounts {
        // Если аккаунт не пустой (data_is_empty == false) и принадлежит нашему Хуку,
        // значит это инициализированная запись BlacklistRecord!
        if !account.data_is_empty() && account.owner == ctx.program_id {
            // Если мы нашли инициализированный блэклист — блокируем перевод!
            msg!("🚨 TRANSFER BLOCKED: Wallet is in Blacklist!");
            return err!(TransferHookError::WalletBlacklisted);
        }
    }
    
    // Если дошли сюда, значит ни один из переданных кошельков не в блэклисте
    Ok(())
}