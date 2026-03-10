//! # SSS Hook — Transfer Hook for SSS-2 Compliance
//!
//! Transfer hook program invoked by Token-2022 on every token transfer for SSS-2 mints.
//! Enforces bidirectional blacklist checking and cross-program pause state verification.
//! Uses ExtraAccountMetaList with dynamic PDA resolution for zero-overhead account passing.

use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM");

#[program]
pub mod sss_hook {
    use super::*;

    /// Initialize the transfer hook program for an SSS-2 stablecoin.
    /// Creates the ExtraAccountMetaList and HookConfig PDAs.
    pub fn initialize_hook(ctx: Context<InitializeHook>) -> Result<()> {
        instructions::initialize::handle_initialize_hook(ctx)
    }

    /// Add a wallet to the blacklist. Only callable by the blacklister role.
    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        wallet: Pubkey,
        reason: String,
    ) -> Result<()> {
        instructions::add_to_blacklist::handle_add_to_blacklist(ctx, wallet, reason)
    }

    /// Remove a wallet from the blacklist. Only callable by the blacklister role.
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        instructions::remove_from_blacklist::handle_remove_from_blacklist(ctx)
    }

    /// Transfer hook executed by Token-2022 on every transfer.
    /// Checks pause state and blacklist entries for both sender and receiver.
    #[interface(spl_transfer_hook_interface::execute)]
    pub fn transfer_hook(ctx: Context<TransferHookCtx>, amount: u64) -> Result<()> {
        instructions::transfer_hook::handle_transfer_hook(ctx, amount)
    }

    /// Fallback handler for the transfer hook interface discriminator.
    /// Required because Anchor's discriminator differs from the SPL interface.
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction =
            spl_transfer_hook_interface::instruction::TransferHookInstruction::unpack(data)?;

        match instruction {
            spl_transfer_hook_interface::instruction::TransferHookInstruction::Execute {
                amount,
            } => {
                let amount_bytes = amount.to_le_bytes();
                __private::__global::transfer_hook(program_id, accounts, &amount_bytes)
            }
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}
