use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

pub mod constants;
pub mod error;

use constants::*;
use error::TransferHookError;

declare_id!("EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389");

/// The SSS core program ID — blacklist/allowlist PDAs live under this program
pub const SSS_CORE_PROGRAM_ID: Pubkey = pubkey!("G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL");

/// Byte offset of the `paused` field in StablecoinConfig account data.
/// Layout: 8 (discriminator) + 32 (authority) + 32 (pending_authority)
///       + 32 (mint) + 32 (transfer_hook_program) = 136
const CONFIG_PAUSED_OFFSET: usize = 136;

// Byte offset constants for reference:
// CONFIG_COMPLIANCE_ENABLED_OFFSET = 137
// CONFIG_SUPPLY_CAP_OFFSET = 154

/// Byte offset of the `enable_allowlist` field
/// 154 + 8 (supply_cap) = 162
const CONFIG_ENABLE_ALLOWLIST_OFFSET: usize = 162;

#[cfg(not(feature = "no-entrypoint"))]
use {solana_security_txt::security_txt};

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "SSS Transfer Hook",
    project_url: "https://github.com/solana-stablecoin-standard",
    contacts: "email:security@sss.dev",
    policy: "https://github.com/solana-stablecoin-standard/blob/main/SECURITY.md",
    preferred_languages: "en",
    auditors: "N/A"
}

#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Initialize the extra account metas list for a given mint.
    /// This tells Token-2022 which additional accounts to pass into execute().
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        let mint_key = ctx.accounts.mint.key();

        let (_config_key, _) = Pubkey::find_program_address(
            &[CONFIG_SEED, mint_key.as_ref()],
            &SSS_CORE_PROGRAM_ID,
        );

        // Extra accounts needed by execute():
        // Account indices in the execute context:
        //   0: source token account
        //   1: mint
        //   2: destination token account
        //   3: owner (authority)
        //   4: extra_account_metas PDA
        //   5: config PDA          (extra[0])
        //   6: sender blacklist     (extra[1])
        //   7: receiver blacklist   (extra[2])
        //   8: sender allowlist     (extra[3])
        //   9: receiver allowlist   (extra[4])
        //  10: sss-core program     (extra[5])
        let extra_account_metas = vec![
            // Extra account 0 (index 5): Config PDA (external PDA under sss-core)
            ExtraAccountMeta::new_external_pda_with_seeds(
                10, // sss-core program is at index 10 (extra account 5)
                &[
                    Seed::Literal {
                        bytes: CONFIG_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 1 }, // mint is account index 1
                ],
                false,
                false,
            )?,
            // Extra account 1 (index 6): Sender blacklist PDA
            ExtraAccountMeta::new_external_pda_with_seeds(
                10, // sss-core program
                &[
                    Seed::Literal {
                        bytes: BLACKLIST_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 5 }, // config PDA (extra account 0)
                    Seed::AccountData {
                        account_index: 0,   // source token account
                        data_index: 32,     // owner offset in SPL Token account
                        length: 32,
                    },
                ],
                false,
                false,
            )?,
            // Extra account 2 (index 7): Receiver blacklist PDA
            ExtraAccountMeta::new_external_pda_with_seeds(
                10, // sss-core program
                &[
                    Seed::Literal {
                        bytes: BLACKLIST_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 5 }, // config PDA
                    Seed::AccountData {
                        account_index: 2,   // destination token account
                        data_index: 32,     // owner offset
                        length: 32,
                    },
                ],
                false,
                false,
            )?,
            // Extra account 3 (index 8): Sender allowlist PDA
            ExtraAccountMeta::new_external_pda_with_seeds(
                10, // sss-core program
                &[
                    Seed::Literal {
                        bytes: ALLOWLIST_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 5 }, // config PDA
                    Seed::AccountData {
                        account_index: 0,   // source token account
                        data_index: 32,     // owner offset
                        length: 32,
                    },
                ],
                false,
                false,
            )?,
            // Extra account 4 (index 9): Receiver allowlist PDA
            ExtraAccountMeta::new_external_pda_with_seeds(
                10, // sss-core program
                &[
                    Seed::Literal {
                        bytes: ALLOWLIST_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 5 }, // config PDA
                    Seed::AccountData {
                        account_index: 2,   // destination token account
                        data_index: 32,     // owner offset
                        length: 32,
                    },
                ],
                false,
                false,
            )?,
            // Extra account 5 (index 10): sss-core program
            ExtraAccountMeta::new_with_pubkey(&SSS_CORE_PROGRAM_ID, false, false)?,
        ];

        // Calculate required space
        let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len())?;
        let lamports = Rent::get()?.minimum_balance(account_size);

        let mint_key_ref = ctx.accounts.mint.key();
        let signer_seeds: &[&[u8]] = &[
            EXTRA_ACCOUNT_METAS_SEED,
            mint_key_ref.as_ref(),
            &[ctx.bumps.extra_account_metas],
        ];

        system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_metas.to_account_info(),
                },
                &[signer_seeds],
            ),
            lamports,
            account_size as u64,
            &crate::id(),
        )?;

        // Write the extra account metas
        let mut data = ctx.accounts.extra_account_metas.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_account_metas)?;

        Ok(())
    }

    /// Execute hook — called by Token-2022 on every transfer.
    /// This is the Anchor-discriminator version (for direct calls / testing).
    pub fn execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
        execute_checks(
            &ctx.accounts.config,
            &ctx.accounts.sender_blacklist_entry,
            &ctx.accounts.receiver_blacklist_entry,
            &ctx.accounts.sender_allowlist_entry,
            &ctx.accounts.receiver_allowlist_entry,
        )
    }

    /// Fallback handler for the SPL Transfer Hook Interface.
    /// Token-2022 calls hooks using SPL interface discriminators, not Anchor's.
    pub fn fallback<'info>(
        _program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        use spl_discriminator::SplDiscriminate;

        if data.len() < 8 {
            return Err(ProgramError::InvalidInstructionData.into());
        }

        let spl_disc = ExecuteInstruction::SPL_DISCRIMINATOR;
        if data[..8] != spl_disc.as_slice()[..8] {
            return Err(ProgramError::InvalidInstructionData.into());
        }

        // Account layout from Token-2022 transfer hook invocation:
        //   [0] source token account
        //   [1] mint
        //   [2] destination token account
        //   [3] owner/authority
        //   [4] extra_account_metas PDA
        //   [5] config PDA          (extra[0])
        //   [6] sender blacklist    (extra[1])
        //   [7] receiver blacklist  (extra[2])
        //   [8] sender allowlist    (extra[3])
        //   [9] receiver allowlist  (extra[4])
        //  [10] sss-core program    (extra[5])
        if accounts.len() < 11 {
            return Err(ProgramError::NotEnoughAccountKeys.into());
        }

        let config_info = &accounts[5];
        let sender_bl = &accounts[6];
        let receiver_bl = &accounts[7];
        let sender_al = &accounts[8];
        let receiver_al = &accounts[9];

        execute_checks(config_info, sender_bl, receiver_bl, sender_al, receiver_al)
    }
}

/// Read the `active` field from a BlacklistEntry account.
/// The BlacklistEntry has a variable-length `reason: String` field, so we must parse the
/// string length first, then skip past it to find the `active` bool.
///
/// Borsh layout:
///   disc(8) + config(32) + address(32) + reason_string(4 + N) + blacklisted_at(8) + blacklisted_by(32) + active(1) + bump(1)
fn read_blacklist_active(data: &[u8]) -> Option<bool> {
    // Minimum size: 8 + 32 + 32 + 4 + 0 + 8 + 32 + 1 + 1 = 118
    if data.len() < 118 {
        return None;
    }
    // Reason string starts at offset 72 (8 + 32 + 32)
    let reason_len_bytes: [u8; 4] = data[72..76].try_into().ok()?;
    let reason_len = u32::from_le_bytes(reason_len_bytes) as usize;

    // active is after: reason_string(4 + reason_len) + blacklisted_at(8) + blacklisted_by(32)
    let active_offset = 76 + reason_len + 8 + 32;

    if data.len() <= active_offset {
        return None;
    }

    Some(data[active_offset] == 1)
}

/// Shared enforcement logic for both Anchor execute and SPL fallback paths.
/// Fail-closed: any ambiguous state blocks the transfer.
fn execute_checks(
    config_info: &AccountInfo,
    sender_blacklist: &AccountInfo,
    receiver_blacklist: &AccountInfo,
    sender_allowlist: &AccountInfo,
    receiver_allowlist: &AccountInfo,
) -> Result<()> {
    // 1. Check pause state from config PDA
    if *config_info.owner == SSS_CORE_PROGRAM_ID && !config_info.data_is_empty() {
        let data = config_info.try_borrow_data()?;
        if data.len() > CONFIG_PAUSED_OFFSET && data[CONFIG_PAUSED_OFFSET] == 1 {
            return Err(TransferHookError::StablecoinPaused.into());
        }

        // 2. Check blacklist — entries now use `active` flag instead of account closure
        // If account is owned by sss-core and has data, read the active flag
        check_blacklist(sender_blacklist, TransferHookError::SenderBlacklisted)?;
        check_blacklist(receiver_blacklist, TransferHookError::ReceiverBlacklisted)?;

        // 3. Check allowlist if enabled
        if data.len() > CONFIG_ENABLE_ALLOWLIST_OFFSET
            && data[CONFIG_ENABLE_ALLOWLIST_OFFSET] == 1
        {
            check_allowlist(sender_allowlist, TransferHookError::SenderNotAllowlisted)?;
            check_allowlist(receiver_allowlist, TransferHookError::ReceiverNotAllowlisted)?;
        }
    } else {
        // Fail-closed: config not readable means we can't verify state
        return Err(TransferHookError::InvalidConfig.into());
    }

    Ok(())
}

/// Check if an address is blacklisted by reading the active flag from the entry.
fn check_blacklist(blacklist_info: &AccountInfo, err: TransferHookError) -> Result<()> {
    if *blacklist_info.owner == SSS_CORE_PROGRAM_ID && !blacklist_info.data_is_empty() {
        let data = blacklist_info.try_borrow_data()?;
        // Read the active flag from the blacklist entry
        if let Some(active) = read_blacklist_active(&data) {
            if active {
                return Err(err.into());
            }
        } else {
            // Can't parse the entry — fail-closed
            return Err(err.into());
        }
    }
    // If PDA doesn't exist (data_is_empty or not owned by sss-core), sender is NOT blacklisted
    Ok(())
}

/// Check if an address is on the allowlist.
/// For allowlist, entries are closed on removal, so existence = allowed.
fn check_allowlist(allowlist_info: &AccountInfo, err: TransferHookError) -> Result<()> {
    // Must exist and be owned by sss-core
    if *allowlist_info.owner == SSS_CORE_PROGRAM_ID && !allowlist_info.data_is_empty() {
        // Allowlist entry exists — address is allowed
        Ok(())
    } else {
        // PDA doesn't exist — address is NOT on the allowlist
        Err(err.into())
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Extra account metas PDA, validated by seeds
    #[account(
        mut,
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump
    )]
    pub extra_account_metas: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Execute context — accounts provided by Token-2022 transfer hook mechanism
#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: Source token account
    pub source: UncheckedAccount<'info>,
    /// CHECK: Mint
    pub mint: UncheckedAccount<'info>,
    /// CHECK: Destination token account
    pub destination: UncheckedAccount<'info>,
    /// CHECK: Owner of source
    pub owner: UncheckedAccount<'info>,
    /// CHECK: Extra account metas PDA
    pub extra_account_metas: UncheckedAccount<'info>,

    // --- Extra accounts from ExtraAccountMetaList ---

    /// CHECK: Config PDA from sss-core (for pause state + allowlist flag)
    pub config: UncheckedAccount<'info>,
    /// CHECK: Sender blacklist PDA from sss-core
    pub sender_blacklist_entry: UncheckedAccount<'info>,
    /// CHECK: Receiver blacklist PDA from sss-core
    pub receiver_blacklist_entry: UncheckedAccount<'info>,
    /// CHECK: Sender allowlist PDA from sss-core (may not exist)
    pub sender_allowlist_entry: UncheckedAccount<'info>,
    /// CHECK: Receiver allowlist PDA from sss-core (may not exist)
    pub receiver_allowlist_entry: UncheckedAccount<'info>,
    /// CHECK: sss-core program
    pub sss_core_program: UncheckedAccount<'info>,
}
