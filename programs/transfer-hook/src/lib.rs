use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("SSSHookXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Called by Token-2022 on every transfer_checked. Validates compliance rules.
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        instructions::execute::handler(ctx, amount)
    }

    /// One-time setup: registers the extra accounts (config + blacklist) that
    /// Token-2022 needs to pass into our execute handler.
    pub fn initialize_extra_account_metas(ctx: Context<InitializeExtraMetas>) -> Result<()> {
        instructions::initialize_extra_metas::handler(ctx)
    }

    // Fallback for the transfer hook interface — Token-2022 expects this exact discriminator
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = spl_transfer_hook_interface::instruction::TransferHookInstruction::unpack(data)?;
        match instruction {
            spl_transfer_hook_interface::instruction::TransferHookInstruction::Execute { amount } => {
                let execute_ix_data = anchor_lang::InstructionData::data(
                    &sss_transfer_hook::instruction::Execute { amount },
                );
                // Re-dispatch through Anchor's routing
                __private::__global::execute(program_id, accounts, &execute_ix_data)
            }
            spl_transfer_hook_interface::instruction::TransferHookInstruction::InitializeExtraAccountMetaList { .. } => {
                let init_data = anchor_lang::InstructionData::data(
                    &sss_transfer_hook::instruction::InitializeExtraAccountMetas {},
                );
                __private::__global::initialize_extra_account_metas(program_id, accounts, &init_data)
            }
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}
