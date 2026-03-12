use anchor_lang::prelude::*;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};

declare_id!("C6psRvWLQ4PyiRcx7KZw5giAhNFtTMLn2foBaToJ36V");

/// The SSS-Token program ID — needed for cross-program PDA derivation.
/// Blacklist PDAs are owned by SSS-Token, but the hook reads them.
const SSS_TOKEN_PROGRAM_ID: Pubkey = pubkey!("6NMdvUa2n4WSLPx9yz7V9edFx9VQqWr5KUDZQGPK3GDL");

#[program]
pub mod transfer_hook {
    use super::*;

    // ──────────────────────────────────────────────────────────────────────────
    // initialize_extra_account_meta_list
    // ──────────────────────────────────────────────────────────────────────────

    /// Registers the additional accounts that Token-2022 must resolve and pass
    /// into every `transfer_checked` call for this mint.
    ///
    /// Called **once** per SSS-2 mint, right after mint creation.
    ///
    /// Extra accounts registered (resolution order matters — each PDA can only
    /// reference accounts that appear earlier in the list or the five base
    /// Execute accounts 0-4):
    ///   [5] SSS-Token program ID      (static; used as the external-PDA program)
    ///   [6] stablecoin state PDA      (derived: ["stablecoin", mint] via accounts[5])
    ///   [7] sender blacklist PDA      (derived: ["blacklist", accounts[6], source_wallet])
    ///   [8] receiver blacklist PDA    (derived: ["blacklist", accounts[6], dest_owner])
    ///   [9] hook state PDA            (stores paused flag, admin, transfer count)
    ///
    /// The hook checks both sender and receiver blacklist on every transfer.
    /// Seizure (permanent-delegate) transfers bypass blacklist checks so that
    /// tokens can be seized from blacklisted accounts.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
        stablecoin_state: Pubkey,
    ) -> Result<()> {
        let account_metas = build_extra_account_metas()?;

        // Allocate and write the extra-account-metas list
        let account_size = ExtraAccountMetaList::size_of(account_metas.len())?;
        let lamports = Rent::get()?.minimum_balance(account_size);

        let mint_key = ctx.accounts.mint.key();
        let signer_seeds: &[&[u8]] = &[
            b"extra-account-metas",
            mint_key.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ];

        anchor_lang::system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
                &[signer_seeds],
            ),
            lamports,
            account_size as u64,
            ctx.program_id,
        )?;

        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &account_metas)?;

        // Initialize hook state
        let hook_state = &mut ctx.accounts.hook_state;
        hook_state.mint = ctx.accounts.mint.key();
        hook_state.admin = ctx.accounts.payer.key();
        hook_state.paused = false;
        hook_state.total_transfers = 0;
        hook_state.stablecoin_state = stablecoin_state;
        hook_state.bump = ctx.bumps.hook_state;

        emit!(HookInitialized {
            mint: ctx.accounts.mint.key(),
            admin: ctx.accounts.payer.key(),
            stablecoin_state,
        });

        Ok(())
    }

    // ──────────────────────────────────────────────────────────────────────────
    // update_extra_account_meta_list
    // ──────────────────────────────────────────────────────────────────────────

    /// Overwrites the extra-account-metas PDA with the current layout.
    ///
    /// Use this after a program upgrade that changes the set of extra accounts
    /// the hook needs (e.g. removing the receiver blacklist PDA). The on-chain
    /// PDA data is read by wallet resolvers, so it must match the deployed code.
    ///
    /// Only the hook admin can call this. The PDA is resized (realloc) and the
    /// data is overwritten in-place.
    pub fn update_extra_account_meta_list(
        ctx: Context<UpdateExtraAccountMetaList>,
    ) -> Result<()> {
        let account_metas = build_extra_account_metas()?;

        // Realloc the PDA to the new size (may shrink or grow)
        let new_size = ExtraAccountMetaList::size_of(account_metas.len())?;
        let meta_account = &ctx.accounts.extra_account_meta_list;

        meta_account.realloc(new_size, false)?;

        // Top up rent if needed
        let rent = Rent::get()?;
        let required_lamports = rent.minimum_balance(new_size);
        let current_lamports = meta_account.lamports();
        if current_lamports < required_lamports {
            let diff = required_lamports - current_lamports;
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.payer.to_account_info(),
                        to: meta_account.to_account_info(),
                    },
                ),
                diff,
            )?;
        }

        // Overwrite the data — zero first because ExtraAccountMetaList::init
        // expects a freshly zeroed buffer (it validates the existing data is empty).
        let mut data = meta_account.try_borrow_mut_data()?;
        data.fill(0);
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &account_metas)?;

        msg!("Extra account metas updated ({} accounts)", account_metas.len());
        Ok(())
    }

    // ──────────────────────────────────────────────────────────────────────────
    // execute — THE HOOK ENTRYPOINT
    // ──────────────────────────────────────────────────────────────────────────

    /// Called by Token-2022 on every `transfer_checked`.
    ///
    /// Checks:
    /// 1. Hook is not paused
    /// 2. If authority is the permanent delegate (seizure), skip blacklist checks
    /// 3. Otherwise, sender AND receiver must not be blacklisted
    /// 4. Increments transfer counter
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        let remaining = &ctx.remaining_accounts;
        // After account resolution by Token-2022, remaining contains:
        // remaining[0] = SSS_TOKEN_PROGRAM_ID   (static, index 5)
        // remaining[1] = stablecoin state PDA   (index 6)
        // remaining[2] = sender blacklist PDA   (index 7)
        // remaining[3] = receiver blacklist PDA (index 8)
        // remaining[4] = hook state PDA         (index 9, writable)

        require!(remaining.len() >= 5, HookError::MissingAccounts);

        let stablecoin_state = &remaining[1];
        let sender_blacklist = &remaining[2];
        let receiver_blacklist = &remaining[3];
        let hook_state_info = &remaining[4];

        // Parse hook state to check paused and increment counter
        let mut hook_data = hook_state_info.try_borrow_mut_data()?;
        // Anchor discriminator is 8 bytes
        if hook_data.len() >= HookState::LEN {
            // Check paused flag: offset = 8 (disc) + 32 (mint) + 32 (admin) = 72
            let paused = hook_data[72] != 0;
            if paused {
                return err!(HookError::TransfersPaused);
            }

            // Increment transfer counter: offset = 72 + 1 (paused) = 73, u64 LE
            let counter_bytes: [u8; 8] = hook_data[73..81].try_into().unwrap_or([0u8; 8]);
            let new_count = u64::from_le_bytes(counter_bytes).saturating_add(1);
            hook_data[73..81].copy_from_slice(&new_count.to_le_bytes());
        }
        drop(hook_data);

        // Derive the permanent delegate PDA to detect seizure transfers.
        // seeds = ["permanent_delegate", stablecoin_state_key], program = SSS_TOKEN_PROGRAM_ID
        let (permanent_delegate, _) = Pubkey::find_program_address(
            &[b"permanent_delegate", stablecoin_state.key.as_ref()],
            &SSS_TOKEN_PROGRAM_ID,
        );

        let authority = ctx.accounts.owner.key();
        let is_seizure = authority == permanent_delegate;

        if !is_seizure {
            // Normal transfer — check both sender and receiver blacklist
            check_not_blacklisted(sender_blacklist, true)?;
            check_not_blacklisted(receiver_blacklist, false)?;
        }
        // Seizure (permanent delegate) bypasses blacklist checks

        emit!(TransferChecked {
            mint: ctx.accounts.mint.key(),
            source: ctx.accounts.source_token.key(),
            destination: ctx.accounts.destination_token.key(),
            amount,
        });

        Ok(())
    }

    // ──────────────────────────────────────────────────────────────────────────
    // pause_hook / unpause_hook — emergency transfer halt
    // ──────────────────────────────────────────────────────────────────────────

    /// Pause all transfers through this hook. Only the hook admin can call this.
    /// This is a nuclear option — use it for emergencies only.
    pub fn pause_hook(ctx: Context<AdminAction>) -> Result<()> {
        let state = &mut ctx.accounts.hook_state;
        require!(!state.paused, HookError::AlreadyPaused);
        state.paused = true;

        emit!(HookPaused {
            mint: state.mint,
            admin: ctx.accounts.admin.key(),
        });

        Ok(())
    }

    /// Resume transfers after a pause.
    pub fn unpause_hook(ctx: Context<AdminAction>) -> Result<()> {
        let state = &mut ctx.accounts.hook_state;
        require!(state.paused, HookError::NotPaused);
        state.paused = false;

        emit!(HookUnpaused {
            mint: state.mint,
            admin: ctx.accounts.admin.key(),
        });

        Ok(())
    }

    // ──────────────────────────────────────────────────────────────────────────
    // update_hook_admin — transfer hook admin to a new key
    // ──────────────────────────────────────────────────────────────────────────

    /// Transfer hook administration to a new authority.
    pub fn update_hook_admin(ctx: Context<AdminAction>, new_admin: Pubkey) -> Result<()> {
        require!(new_admin != Pubkey::default(), HookError::InvalidAdmin);
        let state = &mut ctx.accounts.hook_state;
        let old_admin = state.admin;
        state.admin = new_admin;

        emit!(HookAdminUpdated {
            mint: state.mint,
            old_admin,
            new_admin,
        });

        Ok(())
    }

    // ──────────────────────────────────────────────────────────────────────────
    // get_hook_info — read-only query (returns via event)
    // ──────────────────────────────────────────────────────────────────────────

    /// Emits the current hook state as an event (useful for off-chain indexers).
    pub fn get_hook_info(ctx: Context<GetHookInfo>) -> Result<()> {
        let state = &ctx.accounts.hook_state;

        emit!(HookInfo {
            mint: state.mint,
            admin: state.admin,
            paused: state.paused,
            total_transfers: state.total_transfers,
            stablecoin_state: state.stablecoin_state,
        });

        Ok(())
    }

    // ──────────────────────────────────────────────────────────────────────────
    // fallback — route Token-2022 Execute CPI to our handler
    // ──────────────────────────────────────────────────────────────────────────

    /// Anchor fallback entrypoint — called for any unrecognized instruction.
    ///
    /// Token-2022 invokes the transfer hook via the spl-transfer-hook-interface
    /// `Execute` instruction, whose 8-byte discriminator differs from Anchor's
    /// method discriminator for `execute`. Without a fallback, Anchor returns
    /// InstructionFallbackNotFound (0x65).
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        // SPL transfer-hook Execute discriminator: hash("spl-transfer-hook-interface:execute")[:8]
        let spl_execute_disc: [u8; 8] = [105, 37, 101, 197, 75, 251, 102, 26];

        if data.len() >= 8 && data[..8] == spl_execute_disc {
            return __private::__global::execute(program_id, accounts, &data[8..]);
        }

        Err(ProgramError::InvalidInstructionData.into())
    }
}

// ─── Blacklist check helper ──────────────────────────────────────────────────

fn check_not_blacklisted(account: &AccountInfo, is_sender: bool) -> Result<()> {
    // Account doesn't exist → not blacklisted → allowed
    if account.lamports() == 0 || account.data_is_empty() {
        return Ok(());
    }

    // Account exists → this means a BlacklistEntry PDA was initialized by sss-token.
    let data = account.try_borrow_data()?;
    if data.len() < 9 {
        return Ok(());
    }

    let min_fixed = 8 + 32 + 32 + 4; // = 76
    if data.len() < min_fixed {
        return Ok(());
    }

    let reason_len = u32::from_le_bytes(data[72..76].try_into().unwrap_or([0u8; 4])) as usize;
    let active_offset = 76 + reason_len + 8 + 32; // skip reason bytes + added_at + added_by

    if data.len() > active_offset {
        let active = data[active_offset] != 0;
        if !active {
            return Ok(()); // soft-deactivated — allow
        }
    }

    // Blacklisted and active
    if is_sender {
        err!(HookError::SenderBlacklisted)
    } else {
        err!(HookError::RecipientBlacklisted)
    }
}

// ─── Shared extra-account-meta layout ────────────────────────────────────────

/// Builds the canonical list of extra account metas for the transfer hook.
/// Used by both `initialize_extra_account_meta_list` and `update_extra_account_meta_list`
/// to ensure they always produce the same layout.
///
/// Layout (appended after the 5 base Execute accounts 0-4):
///   [5] SSS-Token program ID      (static)
///   [6] stablecoin state PDA      (["stablecoin", mint] via [5])
///   [7] sender blacklist PDA      (["blacklist", [6], source_owner=[3]] via [5])
///   [8] receiver blacklist PDA    (["blacklist", [6], dest_owner] via [5])
///       dest_owner is extracted from dest token account data (offset 32, 32 bytes)
///   [9] hook state PDA            (["hook-state", mint])
fn build_extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
    Ok(vec![
        // [5] SSS-Token program — static pubkey
        ExtraAccountMeta::new_with_pubkey(&SSS_TOKEN_PROGRAM_ID, false, false)?,

        // [6] stablecoin state PDA
        ExtraAccountMeta::new_external_pda_with_seeds(
            5,
            &[
                Seed::Literal { bytes: b"stablecoin".to_vec() },
                Seed::AccountKey { index: 1 }, // mint
            ],
            false,
            false,
        )?,

        // [7] sender blacklist PDA
        ExtraAccountMeta::new_external_pda_with_seeds(
            5,
            &[
                Seed::Literal { bytes: b"blacklist".to_vec() },
                Seed::AccountKey { index: 6 }, // stablecoin state
                Seed::AccountKey { index: 3 }, // source wallet / owner
            ],
            false,
            false,
        )?,

        // [8] receiver blacklist PDA
        //   dest_owner = AccountData from dest token account (index 2), offset 32, len 32
        ExtraAccountMeta::new_external_pda_with_seeds(
            5,
            &[
                Seed::Literal { bytes: b"blacklist".to_vec() },
                Seed::AccountKey { index: 6 }, // stablecoin state
                Seed::AccountData { account_index: 2, data_index: 32, length: 32 }, // dest owner
            ],
            false,
            false,
        )?,

        // [9] hook state PDA (writable — we increment the transfer counter)
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: b"hook-state".to_vec() },
                Seed::AccountKey { index: 1 }, // mint
            ],
            false,
            true,
        )?,
    ])
}

// ─── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Created via CPI in the handler — seeds validated by Anchor.
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,

    #[account(
        init,
        payer = payer,
        space = HookState::LEN,
        seeds = [b"hook-state", mint.key().as_ref()],
        bump,
    )]
    pub hook_state: Account<'info, HookState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The hook admin must authorize the update.
    pub admin: Signer<'info>,

    /// CHECK: The existing extra-account-metas PDA — will be overwritten.
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,

    #[account(
        has_one = admin @ HookError::Unauthorized,
        seeds = [b"hook-state", mint.key().as_ref()],
        bump = hook_state.bump,
    )]
    pub hook_state: Account<'info, HookState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Execute<'info> {
    /// Source token account
    pub source_token: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,
    /// Mint
    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,
    /// Destination token account
    pub destination_token: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,
    /// Source wallet / owner
    /// CHECK: We only need this as a key for PDA derivation
    pub owner: UncheckedAccount<'info>,
    /// Extra account meta list
    /// CHECK: Validated by Token-2022 runtime
    pub extra_account_meta_list: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(
        mut,
        has_one = admin @ HookError::Unauthorized,
    )]
    pub hook_state: Account<'info, HookState>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetHookInfo<'info> {
    pub hook_state: Account<'info, HookState>,
}

// ─── State ───────────────────────────────────────────────────────────────────

#[account]
pub struct HookState {
    /// The mint this hook is attached to
    pub mint: Pubkey,
    /// Admin that can pause/unpause the hook
    pub admin: Pubkey,
    /// If true, ALL transfers through this hook are blocked
    pub paused: bool,
    /// Running counter of successful transfers
    pub total_transfers: u64,
    /// The SSS-Token stablecoin state PDA (for reference)
    pub stablecoin_state: Pubkey,
    /// PDA bump
    pub bump: u8,
}

impl HookState {
    pub const LEN: usize = 8  // discriminator
        + 32  // mint
        + 32  // admin
        + 1   // paused
        + 8   // total_transfers
        + 32  // stablecoin_state
        + 1;  // bump
}

// ─── Error codes ─────────────────────────────────────────────────────────────

#[error_code]
pub enum HookError {
    #[msg("Transfer blocked: sender is blacklisted")]
    SenderBlacklisted,
    #[msg("Transfer blocked: recipient is blacklisted")]
    RecipientBlacklisted,
    #[msg("All transfers are paused by the hook admin")]
    TransfersPaused,
    #[msg("Hook is already paused")]
    AlreadyPaused,
    #[msg("Hook is not currently paused")]
    NotPaused,
    #[msg("Unauthorized: signer is not the hook admin")]
    Unauthorized,
    #[msg("Invalid admin: cannot set admin to the default public key")]
    InvalidAdmin,
    #[msg("Missing required extra accounts")]
    MissingAccounts,
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct HookInitialized {
    pub mint: Pubkey,
    pub admin: Pubkey,
    pub stablecoin_state: Pubkey,
}

#[event]
pub struct TransferChecked {
    pub mint: Pubkey,
    pub source: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
}

#[event]
pub struct HookPaused {
    pub mint: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct HookUnpaused {
    pub mint: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct HookAdminUpdated {
    pub mint: Pubkey,
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct HookInfo {
    pub mint: Pubkey,
    pub admin: Pubkey,
    pub paused: bool,
    pub total_transfers: u64,
    pub stablecoin_state: Pubkey,
}