use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("hookXMsC9txN6T8hyS9GCyubBL4nvp9XPWg5wW3z3pH");

#[program]
pub mod sss_transfer_hook {
  use super::*;

  pub fn initialize_extra_account_metas(
    ctx: Context<InitializeExtraAccountMetas>,
  ) -> Result<()> {
    instructions::initialize::handler_initialize(ctx)
  }

  pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
    instructions::transfer_hook::handler_transfer_hook(ctx, amount)
  }

  pub fn add_to_blacklist(
    ctx: Context<AddToBlacklist>,
    reason: String,
  ) -> Result<()> {
    instructions::add_to_blacklist::handler_add_to_blacklist(ctx, reason)
  }

  pub fn remove_from_blacklist(
    ctx: Context<RemoveFromBlacklist>,
  ) -> Result<()> {
    instructions::remove_from_blacklist::handler_remove_from_blacklist(ctx)
  }

  /// Fallback entrypoint for the transfer hook interface.
  ///
  /// Token-2022 invokes the hook using the SPL transfer hook interface
  /// discriminator, not Anchor's 8-byte discriminator. This fallback
  /// intercepts those calls and routes them to the Anchor-generated
  /// `transfer_hook` handler.
  pub fn fallback<'info>(
    program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    data: &[u8],
  ) -> Result<()> {
    let instruction =
      spl_transfer_hook_interface::instruction::TransferHookInstruction::unpack(data)?;

    match instruction {
      spl_transfer_hook_interface::instruction::TransferHookInstruction::Execute { amount } => {
        let amount_bytes = amount.to_le_bytes();
        __private::__global::transfer_hook(program_id, accounts, &amount_bytes)
      }
      _ => Err(ProgramError::InvalidInstructionData.into()),
    }
  }
}
