use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use spl_token_2022::extension::BaseStateWithExtensions;
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};

pub mod error;
pub mod state;

use error::TransferHookError;

declare_id!("HgSUZDiLt8UWwzaxhCWwLPPs9zB1F7WTzCFSVmQSaLou");

/// Seeds for the ExtraAccountMetaList PDA (mandated by Transfer Hook interface).
pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";

/// Blacklist PDA seed (must match stablecoin program's BLACKLIST_SEED).
pub const BLACKLIST_SEED: &[u8] = b"blacklist";

/// Allowlist PDA seed (must match stablecoin program's ALLOWLIST_SEED).
pub const ALLOWLIST_SEED: &[u8] = b"allowlist";

/// Config PDA seed (must match stablecoin program's CONFIG_SEED).
pub const CONFIG_SEED: &[u8] = b"stablecoin_config";

#[program]
pub mod transfer_hook {
    use super::*;

    /// Initializes the ExtraAccountMetaList PDA for a given mint.
    /// This must be called before any transfer of the stablecoin can succeed,
    /// because Token-2022 will attempt to resolve the extra accounts.
    ///
    /// The extra accounts list includes:
    /// 0. Stablecoin config PDA (to check pause state)
    /// 1. Stablecoin program ID (for cross-program PDA derivation)
    /// 2. Sender's blacklist entry PDA (derived from source token owner)
    /// 3. Recipient's blacklist entry PDA (derived from dest token owner)
    /// 4. Transfer hook program ID
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
        stablecoin_config: Pubkey,
        stablecoin_program_id: Pubkey,
    ) -> Result<()> {
        let extra_account_metas = get_extra_account_metas(stablecoin_config, stablecoin_program_id)?;

        // Calculate space needed for the extra account meta list.
        let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len())? as u64;
        let lamports = Rent::get()?.minimum_balance(account_size as usize);

        let mint_key = ctx.accounts.mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            EXTRA_ACCOUNT_METAS_SEED,
            mint_key.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ]];

        // Create the ExtraAccountMetaList PDA.
        system_program::create_account(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
            )
            .with_signer(signer_seeds),
            lamports,
            account_size,
            ctx.program_id,
        )?;

        // Initialize the account data with the extra account metas.
        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
            &extra_account_metas,
        )?;

        Ok(())
    }

    /// The transfer hook handler. Called by Token-2022 on every `transfer_checked`.
    /// For SSS-2 (blacklist mode): rejects if sender or recipient is blacklisted.
    /// For SSS-3 (allowlist mode): rejects if sender or recipient is NOT on the allowlist.
    pub fn transfer_hook(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        // Security: verify this is actually being called during a token transfer,
        // not invoked directly by an attacker.
        assert_is_transferring(&ctx)?;

        // Deserialize the stablecoin config using Borsh rather than raw byte offsets,
        // so that any future layout change in StablecoinConfig causes a deserialization
        // error instead of silently reading the wrong byte.
        // Skip the 8-byte Anchor discriminator, then deserialize the mirrored struct.
        let config_info = &ctx.accounts.stablecoin_config;
        let config_data = config_info.try_borrow_data()?;
        let config = state::StablecoinConfigRef::deserialize(&mut &config_data[8..])?;
        drop(config_data);

        if config.is_paused {
            return err!(TransferHookError::StablecoinPaused);
        }

        let is_allowlist_mode = config.enable_allowlist;

        if is_allowlist_mode {
            // SSS-3 allowlist mode: the PDA entries at positions 7/8 are allowlist PDAs.
            // If the account has NO data, the address is not on the allowlist → reject.
            if ctx.accounts.sender_blacklist_entry.data_is_empty() {
                return err!(TransferHookError::SenderNotOnAllowlist);
            }
            if ctx.accounts.recipient_blacklist_entry.data_is_empty() {
                return err!(TransferHookError::RecipientNotOnAllowlist);
            }
        } else {
            // SSS-2 blacklist mode: if the PDA account has data, the address is blacklisted → reject.
            if !ctx.accounts.sender_blacklist_entry.data_is_empty() {
                return err!(TransferHookError::SenderBlacklisted);
            }
            if !ctx.accounts.recipient_blacklist_entry.data_is_empty() {
                return err!(TransferHookError::RecipientBlacklisted);
            }
        }

        Ok(())
    }

    /// Initializes the ExtraAccountMetaList PDA for an SSS-3 (allowlist mode) mint.
    /// Uses allowlist PDA seeds instead of blacklist PDA seeds.
    pub fn initialize_extra_account_meta_list_allowlist(
        ctx: Context<InitializeExtraAccountMetaList>,
        stablecoin_config: Pubkey,
        stablecoin_program_id: Pubkey,
    ) -> Result<()> {
        let extra_account_metas = get_extra_account_metas_allowlist(stablecoin_config, stablecoin_program_id)?;

        let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len())? as u64;
        let lamports = Rent::get()?.minimum_balance(account_size as usize);

        let mint_key = ctx.accounts.mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            EXTRA_ACCOUNT_METAS_SEED,
            mint_key.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ]];

        system_program::create_account(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
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
            &extra_account_metas,
        )?;

        Ok(())
    }

    /// Fallback instruction required for Anchor compatibility with SPL Transfer Hook interface.
    /// Anchor uses 8-byte discriminators while SPL uses its own format. This bridges the gap.
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = TransferHookInstruction::unpack(data)?;

        match instruction {
            TransferHookInstruction::Execute { amount } => {
                let amount_bytes = amount.to_le_bytes();
                __private::__global::transfer_hook(program_id, accounts, &amount_bytes)
            }
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}

/// Builds the list of extra account metas that Token-2022 needs to resolve
/// when calling the transfer hook.
fn get_extra_account_metas(
    stablecoin_config: Pubkey,
    stablecoin_program_id: Pubkey,
) -> Result<Vec<ExtraAccountMeta>> {
    Ok(vec![
        // Index 5: Stablecoin config account (read-only, to check pause state).
        ExtraAccountMeta::new_with_pubkey(&stablecoin_config, false, false)?,

        // Index 6: The stablecoin program (for cross-program PDA derivation of blacklist entries).
        // MUST come before the blacklist PDAs since they reference this account for PDA derivation.
        ExtraAccountMeta::new_with_pubkey(&stablecoin_program_id, false, false)?,

        // Index 7: Sender's blacklist entry PDA (derived from source token owner).
        // Seeds: ["blacklist", config_key, source_owner]
        // The source token account owner is at data offset 32 (after mint pubkey) in the
        // source token account (index 0 in the transfer hook accounts).
        ExtraAccountMeta::new_external_pda_with_seeds(
            6, // stablecoin_program account index
            &[
                Seed::Literal {
                    bytes: BLACKLIST_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 }, // stablecoin_config
                Seed::AccountData {
                    account_index: 0,  // source_token
                    data_index: 32,    // owner field offset in token account
                    length: 32,        // pubkey size
                },
            ],
            false, // is_signer
            false, // is_writable
        )?,

        // Index 8: Recipient's blacklist entry PDA (derived from dest token owner).
        // Seeds: ["blacklist", config_key, dest_owner]
        ExtraAccountMeta::new_external_pda_with_seeds(
            6, // stablecoin_program account index
            &[
                Seed::Literal {
                    bytes: BLACKLIST_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 }, // stablecoin_config
                Seed::AccountData {
                    account_index: 2,  // destination_token
                    data_index: 32,    // owner field offset in token account
                    length: 32,        // pubkey size
                },
            ],
            false,
            false,
        )?,

        // Index 9: This transfer hook program itself (needed for PDA derivation context).
        ExtraAccountMeta::new_with_pubkey(&crate::ID, false, false)?,
    ])
}

/// Builds the extra account metas for allowlist mode (SSS-3).
/// Same structure as blacklist but uses allowlist PDA seeds.
fn get_extra_account_metas_allowlist(
    stablecoin_config: Pubkey,
    stablecoin_program_id: Pubkey,
) -> Result<Vec<ExtraAccountMeta>> {
    Ok(vec![
        // Index 5: Stablecoin config account (read-only, to check pause state and mode).
        ExtraAccountMeta::new_with_pubkey(&stablecoin_config, false, false)?,

        // Index 6: The stablecoin program (for cross-program PDA derivation).
        ExtraAccountMeta::new_with_pubkey(&stablecoin_program_id, false, false)?,

        // Index 7: Sender's allowlist entry PDA.
        ExtraAccountMeta::new_external_pda_with_seeds(
            6,
            &[
                Seed::Literal {
                    bytes: ALLOWLIST_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 },
                Seed::AccountData {
                    account_index: 0,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )?,

        // Index 8: Recipient's allowlist entry PDA.
        ExtraAccountMeta::new_external_pda_with_seeds(
            6,
            &[
                Seed::Literal {
                    bytes: ALLOWLIST_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 },
                Seed::AccountData {
                    account_index: 2,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )?,

        // Index 9: This transfer hook program.
        ExtraAccountMeta::new_with_pubkey(&crate::ID, false, false)?,
    ])
}

/// Verifies that this hook is being called as part of an actual token transfer,
/// not directly by a malicious caller. Checks the `transferring` flag on the
/// source token account's TransferHookAccount extension.
fn assert_is_transferring(ctx: &Context<TransferHook>) -> Result<()> {
    let source_token_info = ctx.accounts.source_token.to_account_info();
    let account_data_ref = source_token_info.try_borrow_data()?;

    // Parse the token account with extensions to check the transferring flag.
    let account = spl_token_2022::extension::StateWithExtensions::<
        spl_token_2022::state::Account,
    >::unpack(&account_data_ref)?;

    let transfer_hook_ext = account
        .get_extension::<spl_token_2022::extension::transfer_hook::TransferHookAccount>()?;

    if !bool::from(transfer_hook_ext.transferring) {
        return err!(TransferHookError::IsNotCurrentlyTransferring);
    }

    Ok(())
}

/// Accounts for initializing the ExtraAccountMetaList.
#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The stablecoin mint that uses this transfer hook.
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: The ExtraAccountMetaList PDA — created in this instruction.
    #[account(
        mut,
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Accounts for the transfer hook execution.
/// The first 5 accounts MUST be in this exact order (mandated by Transfer Hook interface).
#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// The source token account (sender).
    #[account(token::mint = mint)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,

    /// The stablecoin mint.
    pub mint: InterfaceAccount<'info, Mint>,

    /// The destination token account (recipient).
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: The source token account owner (authority).
    pub owner: UncheckedAccount<'info>,

    /// CHECK: The ExtraAccountMetaList PDA.
    #[account(
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    // --- Extra accounts (resolved by Token-2022 from ExtraAccountMetaList) ---

    /// CHECK: Stablecoin config account — read to check pause state.
    pub stablecoin_config: UncheckedAccount<'info>,

    /// CHECK: The stablecoin program (for PDA derivation). Must come before blacklist PDAs.
    pub stablecoin_program: UncheckedAccount<'info>,

    /// CHECK: Sender's blacklist entry PDA. If this account has data, sender is blacklisted.
    pub sender_blacklist_entry: UncheckedAccount<'info>,

    /// CHECK: Recipient's blacklist entry PDA. If this account has data, recipient is blacklisted.
    pub recipient_blacklist_entry: UncheckedAccount<'info>,

    /// CHECK: This transfer hook program.
    pub transfer_hook_program: UncheckedAccount<'info>,
}
