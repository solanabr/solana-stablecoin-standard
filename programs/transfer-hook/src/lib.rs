use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::program_error::ProgramError;
use anchor_lang::solana_program::system_instruction;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::get_extra_account_metas_address;
use spl_transfer_hook_interface::instruction::TransferHookInstruction;

declare_id!("C76nk4L27JJbXiVHR72mWdcq9jX8NETHekECAxw72ZpM");

pub mod state;

/// Transfer Hook Program for SSS-2 Blacklist Enforcement.
///
/// Invoked by Token-2022 on every transfer of tokens with this hook.
/// Checks if the source owner OR destination owner wallet is on the blacklist
/// and rejects the transfer if so.
///
/// SECURITY: Blacklist PDAs are derived from wallet owners (not token accounts).
/// Owner addresses are extracted directly from token account data (offset 32)
/// via ExtraAccountMeta seed resolution, preventing spoofing.

// ─── Accounts ────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeExtraAccountMetas<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The extra account metas PDA (validated by address derivation in handler).
    #[account(mut)]
    pub extra_account_metas: AccountInfo<'info>,

    /// CHECK: The Token-2022 mint this hook is configured for.
    pub mint: AccountInfo<'info>,

    /// CHECK: The stablecoin program, needed as program_id for PDA derivation.
    pub stablecoin_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

// ─── Program ─────────────────────────────────────────────────────

#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Fallback instruction handler dispatching on spl-transfer-hook-interface discriminator.
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = TransferHookInstruction::unpack(data)
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        match instruction {
            TransferHookInstruction::Execute { amount } => {
                execute_transfer_hook(program_id, accounts, amount)?;
            }
            _ => {
                return Err(ProgramError::InvalidInstructionData.into());
            }
        }

        Ok(())
    }

    /// Initialize extra account metas for the transfer hook.
    pub fn initialize_extra_account_metas(
        ctx: Context<InitializeExtraAccountMetas>,
    ) -> Result<()> {
        // Validate the extra_account_metas PDA address
        let expected_key =
            get_extra_account_metas_address(ctx.accounts.mint.key, &crate::ID);
        require_keys_eq!(*ctx.accounts.extra_account_metas.key, expected_key);

        let stablecoin_program_id = ctx.accounts.stablecoin_program.key();

        let extra_metas = vec![
            // Extra account [0]: Source blacklist entry PDA
            // Derived from stablecoin program with seeds:
            //   [b"blacklist", mint_pubkey, source_owner_pubkey]
            // where source_owner is extracted from source token account data at offset 32.
            ExtraAccountMeta::new_external_pda_with_seeds(
                7, // stablecoin program = extra[2] = absolute index 7
                &[
                    Seed::Literal {
                        bytes: b"blacklist".to_vec(),
                    },
                    Seed::AccountKey { index: 1 }, // mint (absolute index 1)
                    Seed::AccountData {
                        account_index: 0,
                        data_index: 32,
                        length: 32,
                    },
                ],
                false,
                false,
            )
            .map_err(|_| ProgramError::InvalidArgument)?,
            // Extra account [1]: Destination blacklist entry PDA
            ExtraAccountMeta::new_external_pda_with_seeds(
                7,
                &[
                    Seed::Literal {
                        bytes: b"blacklist".to_vec(),
                    },
                    Seed::AccountKey { index: 1 },
                    Seed::AccountData {
                        account_index: 2,
                        data_index: 32,
                        length: 32,
                    },
                ],
                false,
                false,
            )
            .map_err(|_| ProgramError::InvalidArgument)?,
            // Extra account [2]: Stablecoin program (for external PDA derivation)
            ExtraAccountMeta::new_with_pubkey(&stablecoin_program_id, false, false)
                .map_err(|_| ProgramError::InvalidArgument)?,
        ];

        // Calculate size needed for the TLV account
        let account_size = ExtraAccountMetaList::size_of(extra_metas.len())
            .map_err(|_| ProgramError::InvalidArgument)?;
        let lamports = Rent::get()?.minimum_balance(account_size);

        // Create the extra account metas PDA
        let mint_key = ctx.accounts.mint.key();
        let signer_seeds: &[&[u8]] = &[b"extra-account-metas", mint_key.as_ref()];
        let (_, bump) = Pubkey::find_program_address(signer_seeds, &crate::ID);
        let signer_seeds_with_bump: &[&[u8]] =
            &[b"extra-account-metas", mint_key.as_ref(), &[bump]];

        invoke_signed(
            &system_instruction::create_account(
                ctx.accounts.payer.key,
                ctx.accounts.extra_account_metas.key,
                lamports,
                account_size as u64,
                &crate::ID,
            ),
            &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.extra_account_metas.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[signer_seeds_with_bump],
        )?;

        // Initialize the extra account metas list
        let mut data = ctx.accounts.extra_account_metas.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<
            spl_transfer_hook_interface::instruction::ExecuteInstruction,
        >(&mut data, &extra_metas)?;

        msg!("Extra account metas initialized for mint {}", mint_key);
        Ok(())
    }
}

// ─── Transfer Hook Execution ─────────────────────────────────────

/// Core transfer hook execution logic.
///
/// Account layout per spl-transfer-hook-interface:
/// [0] source token account
/// [1] mint
/// [2] destination token account
/// [3] source owner/delegate (who authorized the transfer)
/// [4] extra_account_metas PDA
/// [5] source_blacklist_entry PDA (derived from mint + source OWNER)
/// [6] destination_blacklist_entry PDA (derived from mint + destination OWNER)
/// [7] stablecoin program ID (for PDA derivation)
fn execute_transfer_hook<'info>(
    _program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    _amount: u64,
) -> Result<()> {
    if accounts.len() < 5 {
        return Err(ProgramError::NotEnoughAccountKeys.into());
    }

    let source = &accounts[0];
    let mint = &accounts[1];

    let stablecoin_program_id = solana_stablecoin::ID;

    // Check source blacklist PDA
    if accounts.len() > 5 {
        let source_blacklist = &accounts[5];
        let source_owner = extract_owner_from_token_account(source)?;
        check_blacklist_entry(
            mint.key,
            &source_owner,
            source_blacklist,
            &stablecoin_program_id,
        )?;
    }

    // Check destination blacklist PDA
    if accounts.len() > 6 {
        let dest_blacklist = &accounts[6];
        let dest_owner = extract_owner_from_token_account(&accounts[2])?;
        check_blacklist_entry(
            mint.key,
            &dest_owner,
            dest_blacklist,
            &stablecoin_program_id,
        )?;
    }

    msg!("Transfer hook: transfer permitted");
    Ok(())
}

/// Extract the owner pubkey from a Token-2022 token account.
/// In the SPL Token account layout, owner is at offset 32 (after mint).
fn extract_owner_from_token_account(account: &AccountInfo) -> Result<Pubkey> {
    let data = account.try_borrow_data()?;
    if data.len() < 64 {
        return Err(ProgramError::InvalidAccountData.into());
    }
    let owner_bytes: [u8; 32] = data[32..64]
        .try_into()
        .map_err(|_| ProgramError::InvalidAccountData)?;
    Ok(Pubkey::new_from_array(owner_bytes))
}

/// Check if a blacklist PDA exists for the given wallet owner.
fn check_blacklist_entry(
    mint: &Pubkey,
    wallet_owner: &Pubkey,
    blacklist_account: &AccountInfo,
    stablecoin_program_id: &Pubkey,
) -> Result<()> {
    let (expected_pda, _bump) = Pubkey::find_program_address(
        &[b"blacklist", mint.as_ref(), wallet_owner.as_ref()],
        stablecoin_program_id,
    );

    if *blacklist_account.key == expected_pda
        && blacklist_account.owner == stablecoin_program_id
        && !blacklist_account.data_is_empty()
    {
        msg!(
            "Transfer rejected: wallet {} is blacklisted",
            wallet_owner
        );
        return Err(error!(TransferHookError::AddressBlacklisted));
    }

    Ok(())
}

#[error_code]
pub enum TransferHookError {
    #[msg("Transfer rejected: address is blacklisted")]
    AddressBlacklisted,
}
