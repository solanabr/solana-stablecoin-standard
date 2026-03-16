use anchor_lang::prelude::*;

pub mod state;
pub mod error;
pub mod instructions;

use instructions::*;

declare_id!("2b5HCPo4PC7w63MmUnXxuR9kwtaQpni8AXktfZHiMf2p");

#[program]
pub mod sss_transfer_hook {
    use super::*;

    pub fn initialize_hook_config(ctx: Context<InitializeHookConfig>) -> Result<()> {
        instructions::initialize_hook_config::handler(ctx)
    }

    pub fn initialize_extra_account_meta_list(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
        instructions::initialize_extra_account_meta_list::handler(ctx)
    }

    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        instructions::transfer_hook::handler(ctx, amount)
    }

    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, wallet: Pubkey) -> Result<()> {
        instructions::add_to_blacklist::handler(ctx, wallet)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>, wallet: Pubkey) -> Result<()> {
        instructions::remove_from_blacklist::handler(ctx, wallet)
    }

    /// SPL Transfer Hook Interface fallback.
    ///
    /// Token-2022 invokes transfer hooks using the spl_transfer_hook_interface
    /// Execute discriminator, not Anchor's 8-byte sighash. This fallback
    /// intercepts unrecognized discriminators, checks for the SPL Execute
    /// discriminator, and routes to the transfer_hook handler.
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        use spl_transfer_hook_interface::instruction::ExecuteInstruction;
        use spl_discriminator::SplDiscriminate;

        if data.len() < 8 {
            return Err(ProgramError::InvalidInstructionData.into());
        }

        let (discriminator, rest) = data.split_at(8);

        if discriminator == ExecuteInstruction::SPL_DISCRIMINATOR_SLICE {
            return __private::__global::transfer_hook(program_id, accounts, rest);
        }

        Err(ProgramError::InvalidInstructionData.into())
    }
}
