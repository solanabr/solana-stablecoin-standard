use anchor_lang::prelude::*;

pub mod state;
pub mod error;
pub mod instructions;

use instructions::*;

declare_id!("5cs7VzZny1XMj4TAJy2xVqo2tCHM8Vwe9bNbL6uRmbxk"); // Вставь свой ID

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn add_to_blacklist(ctx: Context<ManageBlacklist>, wallet: Pubkey) -> Result<()> {
        instructions::manage::add_to_blacklist(ctx, wallet)
    }

    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        instructions::execute::process_execute(ctx, amount)
    }
}