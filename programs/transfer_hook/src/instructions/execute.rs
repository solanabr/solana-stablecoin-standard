use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Execute<'info> {
    // ВАЖНО: Используем правильный тип InterfaceAccount<'info, TokenAccount>
    #[account(
        token::mint = mint, // Проверяет, что этот кошелек хранит именно наш токен
        token::token_program = anchor_spl::token_interface::Token2022::id(),
    )]
    pub source_account: InterfaceAccount<'info, TokenAccount>,

    #[account()]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::mint = mint,
        token::token_program = anchor_spl::token_interface::Token2022::id(),
    )]
    pub destination_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Авторитет отправителя. Мы просто проверяем его наличие.
    pub owner_delegate: UncheckedAccount<'info>,

    /// CHECK: Программа дополнительной мета-информации (Требование стандарта Хуков).
    pub extra_account_meta_list: UncheckedAccount<'info>,
}

pub fn process_execute(_ctx: Context<Execute>, amount: u64) -> Result<()> {
    // Эта функция вызывается САМОЙ сетью Solana каждый раз, когда кто-то переводит этот токен.
    msg!("Transfer Hook Triggered! Intercepted transfer of {} tokens.", amount);
    
    // Пока это SSS-1/Base логика: мы просто разрешаем все переводы.
    // В SSS-2 здесь появится проверка: "Находится ли source или destination в Черном Списке?"
    
    Ok(())
}