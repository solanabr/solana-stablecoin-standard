use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;

use instructions::*;

declare_id!("9bFjVjyZ3vVmNBFaVVKmjVrzcwwzRNuwWqYpqeM2pzF7");

#[program]
pub mod sss_transfer_hook {
    use super::*;

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        instructions::initialize_extra_account_meta_list::handler(ctx)
    }

    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        instructions::execute::handler(ctx, amount)
    }

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
            } => __private::__global::execute(program_id, accounts, &amount.to_le_bytes()),
            _ => Err(anchor_lang::error::ErrorCode::InstructionFallbackNotFound.into()),
        }
    }
}
