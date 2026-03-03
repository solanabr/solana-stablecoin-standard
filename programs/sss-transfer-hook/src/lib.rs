use anchor_lang::prelude::*;
use spl_discriminator::SplDiscriminate;

pub mod state;
pub mod error;
pub mod instructions;

use instructions::*;

declare_id!("Hook1111111111111111111111111111111111111111");

#[program]
pub mod sss_transfer_hook {
    use super::*;

    pub fn initialize_hook_config(ctx: Context<InitializeHookConfig>) -> Result<()> {
        instructions::initialize_hook_config::handler(ctx)
    }

    pub fn initialize_extra_account_meta_list(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
        instructions::initialize_extra_account_meta_list::handler(ctx)
    }

    #[instruction(discriminator = spl_transfer_hook_interface::instruction::ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        instructions::transfer_hook::handler(ctx, amount)
    }

    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, wallet: Pubkey) -> Result<()> {
        instructions::add_to_blacklist::handler(ctx, wallet)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>, wallet: Pubkey) -> Result<()> {
        instructions::remove_from_blacklist::handler(ctx, wallet)
    }
}
