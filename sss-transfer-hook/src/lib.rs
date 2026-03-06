use anchor_lang::prelude::*;
use anchor_lang::solana_program::account_info::next_account_info;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_token_2022::extension::{
    transfer_hook::TransferHook as MintTransferHook, BaseStateWithExtensions, StateWithExtensions,
};
use spl_token_2022::state::Mint as SplMint;
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};
use std::str::FromStr;

declare_id!("GRx8C8nakzmZpHXi3cHbq2X3n8uCX56V6SSNRFY6EJ97");

const STABLECOIN_PROGRAM_ID_STR: &str = "AmBgA4sV1xFrT4BwbqUU3P3cFqLa6yNJmHyX98k4eW1j";

fn stablecoin_program_id() -> Result<Pubkey> {
    Pubkey::from_str(STABLECOIN_PROGRAM_ID_STR).map_err(|_| ProgramError::InvalidArgument.into())
}

fn build_extra_metas(stablecoin_config: Pubkey) -> Result<Vec<ExtraAccountMeta>> {
    let stablecoin_program = stablecoin_program_id()?;
    Ok(vec![
        ExtraAccountMeta::new_with_pubkey(&stablecoin_program, false, false)?,
        ExtraAccountMeta::new_with_pubkey(&stablecoin_config, false, false)?,
        ExtraAccountMeta::new_external_pda_with_seeds(
            5,
            &[
                Seed::Literal {
                    bytes: b"blacklist".to_vec(),
                },
                Seed::AccountKey { index: 6 },
                Seed::AccountData {
                    account_index: 0,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )?,
        ExtraAccountMeta::new_external_pda_with_seeds(
            5,
            &[
                Seed::Literal {
                    bytes: b"blacklist".to_vec(),
                },
                Seed::AccountKey { index: 6 },
                Seed::AccountData {
                    account_index: 2,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )?,
    ])
}

fn initialize_extra_account_meta_list_interface(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> Result<()> {
    let account_info_iter = &mut accounts.iter();
    let extra_account_meta_list = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let authority_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;

    require!(
        authority_info.is_signer,
        TransferHookError::InvalidAuthority
    );
    require_keys_eq!(
        system_program_info.key(),
        anchor_lang::solana_program::system_program::id(),
        TransferHookError::InvalidSystemProgram
    );

    let (expected_pda, bump) = Pubkey::find_program_address(
        &[b"extra-account-metas", mint_info.key.as_ref()],
        program_id,
    );
    require_keys_eq!(
        extra_account_meta_list.key(),
        expected_pda,
        TransferHookError::InvalidExtraMetaPda
    );

    let mint_data = mint_info.try_borrow_data()?;
    let mint = StateWithExtensions::<SplMint>::unpack(&mint_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    let hook_extension = mint
        .get_extension::<MintTransferHook>()
        .map_err(|_| ProgramError::InvalidAccountData)?;
    let stablecoin_config =
        Option::<Pubkey>::from(hook_extension.authority).ok_or(ProgramError::InvalidAccountData)?;

    let account_metas = build_extra_metas(stablecoin_config)?;
    let account_size = ExtraAccountMetaList::size_of(account_metas.len())?;
    let lamports = Rent::get()?.minimum_balance(account_size);

    if extra_account_meta_list.data_len() == 0 {
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"extra-account-metas", mint_info.key.as_ref(), &[bump]]];
        invoke_signed(
            &system_instruction::create_account(
                authority_info.key,
                extra_account_meta_list.key,
                lamports,
                account_size as u64,
                program_id,
            ),
            &[authority_info.clone(), extra_account_meta_list.clone()],
            signer_seeds,
        )?;
    }

    ExtraAccountMetaList::init::<ExecuteInstruction>(
        &mut extra_account_meta_list.try_borrow_mut_data()?,
        &account_metas,
    )?;

    Ok(())
}

#[program]
pub mod sss_transfer_hook {
    use super::*;

    pub fn transfer_hook(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        let stablecoin_program_id = stablecoin_program_id()?;
        require_keys_eq!(
            ctx.accounts.stablecoin_program.key(),
            stablecoin_program_id,
            TransferHookError::InvalidStablecoinProgram
        );

        if ctx.accounts.owner.key() == ctx.accounts.config.key() {
            return Ok(());
        }

        if ctx.accounts.sender_blacklist.data_len() > 0
            || ctx.accounts.receiver_blacklist.data_len() > 0
        {
            return err!(TransferHookError::BlacklistedAddress);
        }

        Ok(())
    }

    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = TransferHookInstruction::unpack(data)
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        match instruction {
            TransferHookInstruction::Execute { amount } => {
                let amount_bytes = amount.to_le_bytes();
                __private::__global::transfer_hook(program_id, accounts, &amount_bytes)
            }
            TransferHookInstruction::InitializeExtraAccountMetaList { .. } => {
                initialize_extra_account_meta_list_interface(program_id, accounts)
            }
            TransferHookInstruction::UpdateExtraAccountMetaList { .. } => {
                Err(ProgramError::InvalidInstructionData.into())
            }
        }
    }
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(token::mint = mint)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: source token account owner/delegate
    pub owner: UncheckedAccount<'info>,
    /// CHECK: ExtraAccountMetaList PDA
    #[account(seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// CHECK: static stablecoin program ID account
    pub stablecoin_program: UncheckedAccount<'info>,
    /// CHECK: stablecoin config PDA used in blacklist seeds
    pub config: UncheckedAccount<'info>,
    /// CHECK: sender blacklist PDA from stablecoin program
    pub sender_blacklist: UncheckedAccount<'info>,
    /// CHECK: receiver blacklist PDA from stablecoin program
    pub receiver_blacklist: UncheckedAccount<'info>,
}

#[error_code]
pub enum TransferHookError {
    #[msg("Sender or recipient is blacklisted")]
    BlacklistedAddress,
    #[msg("Invalid stablecoin program account")]
    InvalidStablecoinProgram,
    #[msg("Invalid authority signer")]
    InvalidAuthority,
    #[msg("Invalid system program account")]
    InvalidSystemProgram,
    #[msg("Invalid extra account meta PDA")]
    InvalidExtraMetaPda,
}
