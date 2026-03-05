use anchor_lang::solana_program::account_info::AccountInfo;
use anchor_lang::solana_program::entrypoint;
use anchor_lang::solana_program::entrypoint::ProgramResult;
use anchor_lang::solana_program::msg;
use anchor_lang::solana_program::program_error::ProgramError;
use anchor_lang::solana_program::pubkey::Pubkey;
use spl_transfer_hook_interface::instruction::TransferHookInstruction;

anchor_lang::declare_id!("FiUMBoLyzCzgXQwysxY7ypo4DcZ21Svd2qScsfdtsrj");

pub const BLACKLISTED_ADDRESS_ERROR: u32 = 0x1770;

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    match TransferHookInstruction::unpack(instruction_data) {
        Ok(TransferHookInstruction::Execute { .. }) => process_execute(accounts),
        Ok(TransferHookInstruction::InitializeExtraAccountMetaList { .. }) => Ok(()),
        Ok(TransferHookInstruction::UpdateExtraAccountMetaList { .. }) => Ok(()),
        Err(_) => Err(ProgramError::InvalidInstructionData),
    }
}

fn process_execute(accounts: &[AccountInfo]) -> ProgramResult {
    if accounts.len() < 5 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    match (
        accounts.get(5).map(AccountInfo::data_len),
        accounts.get(6).map(AccountInfo::data_len),
    ) {
        (Some(sender_len), _) if sender_len > 0 => {
            msg!("sender blacklisted");
            Err(ProgramError::Custom(BLACKLISTED_ADDRESS_ERROR))
        }
        (_, Some(receiver_len)) if receiver_len > 0 => {
            msg!("receiver blacklisted");
            Err(ProgramError::Custom(BLACKLISTED_ADDRESS_ERROR))
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blacklist_error_code_matches_expected_constant() {
        assert_eq!(BLACKLISTED_ADDRESS_ERROR, 0x1770);
    }

    #[test]
    fn invalid_instruction_data_is_rejected() {
        let result = process_instruction(&crate::id(), &[], &[1, 2, 3]);
        assert_eq!(result, Err(ProgramError::InvalidInstructionData));
    }

    #[test]
    fn initialize_meta_list_instruction_is_noop_success() {
        let data = TransferHookInstruction::InitializeExtraAccountMetaList {
            extra_account_metas: vec![],
        }
        .pack();
        let result = process_instruction(&crate::id(), &[], &data);
        assert!(result.is_ok());
    }

    #[test]
    fn update_meta_list_instruction_is_noop_success() {
        let data = TransferHookInstruction::UpdateExtraAccountMetaList {
            extra_account_metas: vec![],
        }
        .pack();
        let result = process_instruction(&crate::id(), &[], &data);
        assert!(result.is_ok());
    }
}
