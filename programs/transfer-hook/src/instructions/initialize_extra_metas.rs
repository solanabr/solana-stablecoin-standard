use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::get_extra_account_metas_address;

use crate::ID;

#[derive(Accounts)]
pub struct InitializeExtraAccountMetas<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The extra account metas PDA (validated by address derivation below).
    #[account(mut)]
    pub extra_account_metas: AccountInfo<'info>,

    /// CHECK: The Token-2022 mint this hook is configured for.
    pub mint: AccountInfo<'info>,

    /// CHECK: The stablecoin program, needed as program_id for PDA derivation.
    pub stablecoin_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeExtraAccountMetas>) -> Result<()> {
    // Validate the extra_account_metas PDA address
    let expected_key = get_extra_account_metas_address(ctx.accounts.mint.key, &ID);
    require_keys_eq!(*ctx.accounts.extra_account_metas.key, expected_key);

    // The stablecoin program is accounts[7] in the execute call:
    // [0] source, [1] mint, [2] dest, [3] owner, [4] extra_metas_pda,
    // [5] source_blacklist, [6] dest_blacklist, [7] stablecoin_program
    //
    // Extra account meta indices are relative to the extra accounts list:
    // extra[0] = source_blacklist_entry PDA
    // extra[1] = destination_blacklist_entry PDA
    // extra[2] = stablecoin program (for external PDA derivation)

    let stablecoin_program_id = ctx.accounts.stablecoin_program.key();

    // IMPORTANT: Stablecoin program must come FIRST (extra[0], absolute index 5)
    // so that subsequent extra metas can reference it by index when resolving.
    // Token-2022 resolves extras IN ORDER, building the account list incrementally.
    // Standard accounts: [0]=source, [1]=mint, [2]=dest, [3]=authority, [4]=validation_pda
    // Extra[0] at index 5 = stablecoin program (literal, available immediately)
    // Extra[1] at index 6 = source blacklist PDA (references program at index 5)
    // Extra[2] at index 7 = dest blacklist PDA (references program at index 5)
    let extra_metas = vec![
        // Extra account [0]: Stablecoin program (needed for external PDA derivation)
        // Must be first so index 5 is available when resolving subsequent PDAs.
        ExtraAccountMeta::new_with_pubkey(&stablecoin_program_id, false, false)
            .map_err(|_| ProgramError::InvalidArgument)?,

        // Extra account [1]: Source blacklist entry PDA
        // Derived from stablecoin program (index 5) with seeds:
        //   [b"blacklist", mint_pubkey, source_owner_pubkey]
        ExtraAccountMeta::new_external_pda_with_seeds(
            5, // stablecoin program = extra[0] = absolute index 5
            &[
                Seed::Literal {
                    bytes: b"blacklist".to_vec(),
                },
                Seed::AccountKey { index: 1 }, // mint (absolute index 1)
                Seed::AccountData {
                    account_index: 0,  // source token account
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )
        .map_err(|_| ProgramError::InvalidArgument)?,

        // Extra account [2]: Destination blacklist entry PDA
        ExtraAccountMeta::new_external_pda_with_seeds(
            5, // stablecoin program = extra[0] = absolute index 5
            &[
                Seed::Literal {
                    bytes: b"blacklist".to_vec(),
                },
                Seed::AccountKey { index: 1 }, // mint (absolute index 1)
                Seed::AccountData {
                    account_index: 2,  // destination token account
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )
        .map_err(|_| ProgramError::InvalidArgument)?,
    ];

    // Calculate size needed for the TLV account
    let account_size = ExtraAccountMetaList::size_of(extra_metas.len())
        .map_err(|_| ProgramError::InvalidArgument)?;
    let lamports = Rent::get()?.minimum_balance(account_size);

    // Create the extra account metas PDA using invoke_signed
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[b"extra-account-metas", mint_key.as_ref()];
    let (_, bump) = Pubkey::find_program_address(signer_seeds, &ID);
    let signer_seeds_with_bump: &[&[u8]] = &[b"extra-account-metas", mint_key.as_ref(), &[bump]];

    invoke_signed(
        &system_instruction::create_account(
            ctx.accounts.payer.key,
            ctx.accounts.extra_account_metas.key,
            lamports,
            account_size as u64,
            &ID,
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
    ExtraAccountMetaList::init::<spl_transfer_hook_interface::instruction::ExecuteInstruction>(
        &mut data,
        &extra_metas,
    )?;

    msg!("Extra account metas initialized for mint {}", mint_key);
    Ok(())
}
