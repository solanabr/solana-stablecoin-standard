use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};

declare_id!("FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy");

/// The SSS Token program ID — the program that owns BlacklistEntry PDAs.
/// This is set at deploy time. For devnet/localnet, update after deploying sss-token.
pub const SSS_TOKEN_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4");

#[error_code]
pub enum HookError {
    #[msg("Source address is blacklisted")]
    SourceBlacklisted,
    #[msg("Destination address is blacklisted")]
    DestinationBlacklisted,
}

#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Initializes the ExtraAccountMetaList for the transfer hook.
    /// This declares which additional accounts Token-2022 must resolve and pass
    /// when invoking the hook on every transfer.
    ///
    /// Must be called once after deploying the hook program, before any transfers.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        let extra_account_metas = build_extra_account_metas()?;

        let account_size =
            ExtraAccountMetaList::size_of(extra_account_metas.len()).map_err(|_| {
                anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::AccountDidNotSerialize)
            })?;

        // Allocate the ExtraAccountMetaList account
        let lamports = Rent::get()?.minimum_balance(account_size);
        let extra_metas_account = &ctx.accounts.extra_account_meta_list;
        let mint_key = ctx.accounts.mint.key();
        let signer_seeds: &[&[u8]] = &[
            b"extra-account-metas",
            mint_key.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ];

        system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: extra_metas_account.to_account_info(),
                },
                &[signer_seeds],
            ),
            lamports,
            account_size as u64,
            ctx.program_id,
        )?;

        // Write the extra account metas to the account
        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut extra_metas_account.try_borrow_mut_data()?,
            &extra_account_metas,
        )
        .map_err(|_| {
            anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::AccountDidNotSerialize)
        })?;

        Ok(())
    }

    /// The transfer hook execute handler. Called by Token-2022 on every transfer.
    ///
    /// Checks if the source authority or destination owner is blacklisted by
    /// verifying whether their BlacklistEntry PDA (owned by sss-token) exists.
    /// If either is blacklisted, the transfer is rejected.
    pub fn transfer_hook(ctx: Context<TransferHookExecute>, _amount: u64) -> Result<()> {
        // Check if the config PDA (permanent delegate) is the authority.
        // If so, this is a program-initiated transfer (e.g., seize) — allow it.
        let config = &ctx.accounts.config;
        let authority = &ctx.accounts.authority;
        if config.owner == &SSS_TOKEN_PROGRAM_ID
            && !config.data_is_empty()
            && authority.key == config.key
        {
            return Ok(());
        }

        let source_blacklist = &ctx.accounts.source_blacklist;
        let dest_blacklist = &ctx.accounts.dest_blacklist;

        // If source BlacklistEntry PDA exists (has data & owned by sss-token), block
        if !source_blacklist.data_is_empty()
            && source_blacklist.owner == &SSS_TOKEN_PROGRAM_ID
        {
            return Err(HookError::SourceBlacklisted.into());
        }

        // If destination BlacklistEntry PDA exists, block
        if !dest_blacklist.data_is_empty()
            && dest_blacklist.owner == &SSS_TOKEN_PROGRAM_ID
        {
            return Err(HookError::DestinationBlacklisted.into());
        }

        Ok(())
    }

    /// Fallback handler to route Token-2022 CPI calls to the correct handler.
    /// Token-2022 uses the spl-transfer-hook-interface discriminator, not Anchor's.
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
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}


/// Builds the list of extra account metas needed for the transfer hook.
///
/// Transfer hook standard accounts (indices 0-4):
///   0: source token account
///   1: mint
///   2: destination token account
///   3: source authority (wallet initiating the transfer)
///   4: ExtraAccountMetaList PDA
///
/// Extra accounts we add (indices 5-8):
///   5: sss-token program (literal) — needed for PDA derivation
///   6: StablecoinConfig PDA — derived from sss-token: ["config", mint]
///   7: Source BlacklistEntry PDA — derived from sss-token: ["blacklist", config, authority]
///   8: Dest BlacklistEntry PDA — derived from sss-token: ["blacklist", config, dest_owner]
fn build_extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
    Ok(vec![
        // Account 5: sss-token program (literal pubkey)
        ExtraAccountMeta::new_with_pubkey(&SSS_TOKEN_PROGRAM_ID, false, false)
            .map_err(|_| anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::AccountDidNotSerialize))?,
        // Account 6: StablecoinConfig PDA (external PDA from sss-token)
        // Seeds: ["config", mint_key]
        ExtraAccountMeta::new_external_pda_with_seeds(
            5, // program index: sss-token program at index 5
            &[
                Seed::Literal {
                    bytes: b"config".to_vec(),
                },
                Seed::AccountKey { index: 1 }, // mint at index 1
            ],
            false, // is_signer
            false, // is_writable
        )
        .map_err(|_| anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::AccountDidNotSerialize))?,
        // Account 7: Source BlacklistEntry PDA
        // Seeds: ["blacklist", config_key, source_authority]
        ExtraAccountMeta::new_external_pda_with_seeds(
            5, // program index: sss-token program
            &[
                Seed::Literal {
                    bytes: b"blacklist".to_vec(),
                },
                Seed::AccountKey { index: 6 }, // config at index 6
                Seed::AccountKey { index: 3 }, // source authority at index 3
            ],
            false,
            false,
        )
        .map_err(|_| anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::AccountDidNotSerialize))?,
        // Account 8: Destination BlacklistEntry PDA
        // Seeds: ["blacklist", config_key, dest_token_account_owner]
        // The owner is stored at offset 32 in the token account (after the 32-byte mint field)
        ExtraAccountMeta::new_external_pda_with_seeds(
            5, // program index: sss-token program
            &[
                Seed::Literal {
                    bytes: b"blacklist".to_vec(),
                },
                Seed::AccountKey { index: 6 }, // config at index 6
                Seed::AccountData {
                    account_index: 2, // destination token account at index 2
                    data_index: 32,   // owner field offset in SPL Token account
                    length: 32,       // pubkey is 32 bytes
                },
            ],
            false,
            false,
        )
        .map_err(|_| anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::AccountDidNotSerialize))?,
    ])
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The ExtraAccountMetaList PDA. Created in the handler.
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferHookExecute<'info> {
    /// CHECK: Source token account — validated by Token-2022
    pub source: AccountInfo<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Destination token account — validated by Token-2022
    pub destination: AccountInfo<'info>,

    /// CHECK: Source authority — validated by Token-2022
    pub authority: AccountInfo<'info>,

    /// CHECK: ExtraAccountMetaList PDA — validated by Token-2022
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    /// CHECK: sss-token program (literal from ExtraAccountMetaList)
    pub sss_token_program: AccountInfo<'info>,

    /// CHECK: StablecoinConfig PDA from sss-token (derived via ExtraAccountMetaList)
    pub config: AccountInfo<'info>,

    /// CHECK: Source BlacklistEntry PDA from sss-token.
    /// May or may not exist — if it exists, source is blacklisted.
    pub source_blacklist: AccountInfo<'info>,

    /// CHECK: Destination BlacklistEntry PDA from sss-token.
    /// May or may not exist — if it exists, destination is blacklisted.
    pub dest_blacklist: AccountInfo<'info>,
}
