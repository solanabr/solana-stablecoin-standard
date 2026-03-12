use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::Mint;
use solana_security_txt::security_txt;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};

declare_id!("FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy");

security_txt! {
    name: "SSS Transfer Hook",
    project_url: "https://github.com/solanabr/solana-stablecoin-standard",
    contacts: "link:https://github.com/solanabr/solana-stablecoin-standard/issues",
    policy: "https://github.com/solanabr/solana-stablecoin-standard/blob/main/SECURITY.md",
    source_code: "https://github.com/solanabr/solana-stablecoin-standard",
    auditors: "N/A"
}

/// The SSS Token program ID — the program that owns BlacklistEntry PDAs.
///
/// This constant must be updated when deploying to different networks.
/// Token-2022 transfer hooks cannot dynamically resolve the parent program at
/// runtime — the extra-account-meta list is written once and baked into on-chain
/// state. This means the hook must know the sss-token program ID at compile time.
///
/// To update: change the pubkey literal below to match your deployed sss-token
/// program ID, then rebuild and redeploy the transfer-hook program.
pub const SSS_TOKEN_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4");

#[error_code]
pub enum HookError {
    #[msg("Source address is blacklisted")]
    SourceBlacklisted,
    #[msg("Destination address is blacklisted")]
    DestinationBlacklisted,
    #[msg("Unauthorized: caller is not the master authority")]
    Unauthorized,
    #[msg("Invalid config account")]
    InvalidConfig,
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
        // Verify config PDA derivation
        let (expected_config, _bump) = Pubkey::find_program_address(
            &[b"config", ctx.accounts.mint.key().as_ref()],
            &SSS_TOKEN_PROGRAM_ID,
        );
        require!(
            ctx.accounts.config.key() == expected_config,
            HookError::InvalidConfig
        );

        // Verify config is owned by sss-token program
        require!(
            ctx.accounts.config.owner == &SSS_TOKEN_PROGRAM_ID,
            HookError::InvalidConfig
        );

        // Read master_authority from config data
        // Layout: 8 (discriminator) + 1 (bump) + 32 (mint) + 32 (master_authority)
        let config_data = ctx.accounts.config.try_borrow_data()?;
        require!(config_data.len() >= 73, HookError::InvalidConfig);
        let master_authority_bytes: [u8; 32] = config_data[41..73]
            .try_into()
            .map_err(|_| error!(HookError::InvalidConfig))?;
        let master_authority = Pubkey::new_from_array(master_authority_bytes);

        // Verify caller is master authority
        require!(
            ctx.accounts.authority.key() == master_authority,
            HookError::Unauthorized
        );

        // The extra account metas use SSS_TOKEN_PROGRAM_ID (a compile-time constant)
        // because Token-2022's ExtraAccountMetaList is written once at initialization
        // and cannot perform dynamic program lookups. All `external_pda_with_seeds`
        // entries reference the sss-token program by index, which resolves to this
        // constant at account-resolution time.
        let extra_account_metas = build_extra_account_metas()?;

        let account_size =
            ExtraAccountMetaList::size_of(extra_account_metas.len()).map_err(|_| {
                anchor_lang::error::Error::from(
                    anchor_lang::error::ErrorCode::AccountDidNotSerialize,
                )
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
    /// Checks if the source or destination token-account owner is blacklisted by
    /// verifying whether their BlacklistEntry PDA (owned by sss-token) exists.
    /// If either is blacklisted, the transfer is rejected.
    pub fn transfer_hook(ctx: Context<TransferHookExecute>, _amount: u64) -> Result<()> {
        let mint_key = ctx.accounts.mint.key();
        let config = &ctx.accounts.config;
        let authority = &ctx.accounts.authority;

        // Defense-in-depth: verify config PDA matches expected derivation
        let (expected_config, _) =
            Pubkey::find_program_address(&[b"config", mint_key.as_ref()], &SSS_TOKEN_PROGRAM_ID);

        // If config doesn't match or isn't owned by sss-token, allow transfer
        // (this mint may not be an SSS stablecoin, or config doesn't exist)
        if config.key() != expected_config
            || config.owner != &SSS_TOKEN_PROGRAM_ID
            || config.data_is_empty()
        {
            return Ok(());
        }

        // Seize bypass: if authority IS the config PDA, it's a program operation
        if authority.key == &expected_config {
            return Ok(());
        }

        // Check source blacklist — verify owner is sss-token (defense-in-depth)
        let source_blacklist = &ctx.accounts.source_blacklist;
        if source_blacklist.owner == &SSS_TOKEN_PROGRAM_ID && !source_blacklist.data_is_empty() {
            return Err(HookError::SourceBlacklisted.into());
        }

        // Check destination blacklist — verify owner is sss-token (defense-in-depth)
        let dest_blacklist = &ctx.accounts.dest_blacklist;
        if dest_blacklist.owner == &SSS_TOKEN_PROGRAM_ID && !dest_blacklist.data_is_empty() {
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
///   7: Source BlacklistEntry PDA — derived from sss-token: ["blacklist", config, source_owner]
///   8: Dest BlacklistEntry PDA — derived from sss-token: ["blacklist", config, dest_owner]
fn build_extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
    Ok(vec![
        // Account 5: sss-token program (literal pubkey)
        ExtraAccountMeta::new_with_pubkey(&SSS_TOKEN_PROGRAM_ID, false, false).map_err(|_| {
            anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::AccountDidNotSerialize)
        })?,
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
        .map_err(|_| {
            anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::AccountDidNotSerialize)
        })?,
        // Account 7: Source BlacklistEntry PDA
        // Seeds: ["blacklist", config_key, source_token_account_owner]
        // SECURITY: derive from the source token account's owner field (offset 32),
        // NOT from the authority/delegate (index 3), to prevent delegate bypass.
        ExtraAccountMeta::new_external_pda_with_seeds(
            5, // program index: sss-token program
            &[
                Seed::Literal {
                    bytes: b"blacklist".to_vec(),
                },
                Seed::AccountKey { index: 6 }, // config at index 6
                Seed::AccountData {
                    account_index: 0, // source token account at index 0
                    data_index: 32,   // owner field offset in SPL Token account
                    length: 32,       // pubkey is 32 bytes
                },
            ],
            false,
            false,
        )
        .map_err(|_| {
            anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::AccountDidNotSerialize)
        })?,
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
        .map_err(|_| {
            anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::AccountDidNotSerialize)
        })?,
    ])
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The authority that must match the stablecoin's master_authority.
    /// Prevents unauthorized actors from initializing the meta list.
    pub authority: Signer<'info>,

    /// CHECK: The ExtraAccountMetaList PDA. Created in the handler.
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: StablecoinConfig PDA from sss-token. Validated in handler.
    pub config: UncheckedAccount<'info>,

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
