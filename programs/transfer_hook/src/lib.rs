use anchor_lang::prelude::*;
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};

pub mod instructions;
use instructions::*;

// ВСТАВЬ СЮДА СВОЙ HOOK_PROGRAM_ID
declare_id!("5cs7VzZny1XMj4TAJy2xVqo2tCHM8Vwe9bNbL6uRmbxk"); 

#[program]
pub mod transfer_hook {
    use super::*;

    // Сигнатура функции должна строго соответствовать стандарту Transfer Hook!
    // Важно: в Anchor 0.30 fallback инструкция (которой является хук) обрабатывается особым образом.
    // Но для простоты реализации на хакатоне мы сделаем публичный метод execute.
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        instructions::process_execute(ctx, amount)
    }
}