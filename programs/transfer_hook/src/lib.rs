use anchor_lang::{
    prelude::*,
    system_program::{create_account, CreateAccount},
};
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_token_2022::extension::{BaseStateWithExtensions, StateWithExtensions};
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};
use spl_transfer_hook_interface::solana_pubkey::Pubkey as SolanaPubkey;

declare_id!("Fsg5gXrxo5Spx3ffMHVRpGsi919U141fWrd5EDo96iw2");

/// Must match SSS BLACKLIST_SEED for PDA derivation.
const BLACKLIST_SEED: &[u8] = b"blacklist";

/// Offset of is_blacklisted in BlacklistedEntry: discriminator (8) + bump (1) = 9.
const BLACKLISTED_ENTRY_IS_BLACKLISTED_OFFSET: usize = 9;

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Index 0-3: source, mint, destination, owner
        // Index 4: extra_account_meta_list
        // Index 5: sss_program
        // Index 6: source_owner_blacklist_entry (PDA on SSS: blacklist + mint + owner)
        // Index 7: destination_owner_blacklist_entry (PDA on SSS: blacklist + mint + dest_owner from account data)
        let sss_program_key =
            SolanaPubkey::new_from_array(ctx.accounts.sss_program.key().to_bytes());
        let account_metas = vec![
            ExtraAccountMeta::new_with_pubkey(&sss_program_key, false, false).map_err(|_| {
                anchor_lang::error::Error::from(ProgramError::InvalidInstructionData)
            })?,
            ExtraAccountMeta::new_external_pda_with_seeds(
                5, // sss_program index
                &[
                    Seed::Literal {
                        bytes: BLACKLIST_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 1 }, // mint
                    Seed::AccountKey { index: 3 }, // source owner
                ],
                false,
                false,
            )
            .map_err(|_| anchor_lang::error::Error::from(ProgramError::InvalidInstructionData))?,
            ExtraAccountMeta::new_external_pda_with_seeds(
                5, // sss_program index
                &[
                    Seed::Literal {
                        bytes: BLACKLIST_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 1 }, // mint
                    Seed::AccountData {
                        account_index: 2, // destination token account
                        data_index: 32,   // owner at offset 32 in SPL Token Account
                        length: 32,
                    },
                ],
                false,
                false,
            )
            .map_err(|_| anchor_lang::error::Error::from(ProgramError::InvalidInstructionData))?,
        ];

        let account_size = ExtraAccountMetaList::size_of(account_metas.len())
            .map_err(|_| anchor_lang::error::Error::from(ProgramError::InvalidInstructionData))?
            as u64;
        let lamports = Rent::get()?.minimum_balance(account_size as usize);

        let mint = ctx.accounts.mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"extra-account-metas",
            mint.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ]];

        create_account(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
            )
            .with_signer(signer_seeds),
            lamports,
            account_size,
            ctx.program_id,
        )?;

        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
            &account_metas,
        )
        .map_err(|_| anchor_lang::error::Error::from(ProgramError::InvalidInstructionData))?;

        Ok(())
    }

    pub fn transfer_hook(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        assert_is_transferring(&ctx)?;

        let sss_program_id = ctx.accounts.sss_program.key();

        // Reject if source owner is blacklisted
        if is_blacklisted(&ctx.accounts.source_owner_blacklist_entry, &sss_program_id)? {
            return err!(TransferHookError::SourceWalletBlacklisted);
        }

        // Reject if destination owner is blacklisted
        if is_blacklisted(
            &ctx.accounts.destination_owner_blacklist_entry,
            &sss_program_id,
        )? {
            return err!(TransferHookError::DestinationWalletBlacklisted);
        }

        Ok(())
    }

    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = TransferHookInstruction::unpack(data)
            .map_err(|_| anchor_lang::error::Error::from(ProgramError::InvalidInstructionData))?;

        match instruction {
            TransferHookInstruction::Execute { amount } => {
                let amount_bytes = amount.to_le_bytes();
                __private::__global::transfer_hook(program_id, accounts, &amount_bytes)
            }
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: ExtraAccountMetaList account; seeds = [b"extra-account-metas", mint]
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: SSS program ID; used to derive blacklist PDAs and validate ownership.
    pub sss_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Order matches Token-2022 CPI: source, mint, destination, owner, extra_account_meta_list, then extras.
#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(
        token::mint = mint,
        token::authority = owner,
    )]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: source token account owner
    pub owner: UncheckedAccount<'info>,
    /// CHECK: ExtraAccountMetaList account
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// CHECK: SSS program ID
    pub sss_program: UncheckedAccount<'info>,
    /// CHECK: BlacklistedEntry PDA for source owner (SSS program); may not exist.
    pub source_owner_blacklist_entry: UncheckedAccount<'info>,
    /// CHECK: BlacklistedEntry PDA for destination owner (SSS program); may not exist.
    pub destination_owner_blacklist_entry: UncheckedAccount<'info>,
}

fn assert_is_transferring(ctx: &Context<TransferHook>) -> Result<()> {
    let source_token_info = ctx.accounts.source_token.to_account_info();
    let account_data_ref = source_token_info.try_borrow_data()?;
    let account = StateWithExtensions::<spl_token_2022::state::Account>::unpack(*account_data_ref)?;
    let ext =
        account.get_extension::<spl_token_2022::extension::transfer_hook::TransferHookAccount>()?;

    if !bool::from(ext.transferring) {
        return err!(TransferHookError::IsNotCurrentlyTransferring);
    }
    Ok(())
}

/// Returns true if the account is a valid BlacklistedEntry owned by SSS and is_blacklisted is true.
fn is_blacklisted(account: &UncheckedAccount, sss_program_id: &Pubkey) -> Result<bool> {
    if account.data_is_empty() {
        return Ok(false);
    }
    if account.owner != sss_program_id {
        return Ok(false);
    }
    let data = account.try_borrow_data()?;
    if data.len() <= BLACKLISTED_ENTRY_IS_BLACKLISTED_OFFSET {
        return Ok(false);
    }
    Ok(data[BLACKLISTED_ENTRY_IS_BLACKLISTED_OFFSET] != 0)
}

#[error_code]
pub enum TransferHookError {
    #[msg("The token is not currently transferring")]
    IsNotCurrentlyTransferring,
    #[msg("Source wallet is blacklisted")]
    SourceWalletBlacklisted,
    #[msg("Destination wallet is blacklisted")]
    DestinationWalletBlacklisted,
}
