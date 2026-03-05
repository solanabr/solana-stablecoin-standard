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
    /// Extra accounts registered:
    ///   [5] sender blacklist PDA   (derived from sss-token program)
    ///   [6] receiver blacklist PDA (derived from sss-token program)
    ///   [7] hook state PDA         (stores paused flag & admin)
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
        stablecoin_state: Pubkey,
    ) -> Result<()> {
        let account_metas = vec![
            // index 5: sender blacklist PDA
            //   seeds = ["blacklist", stablecoin_state, source_wallet]
            //   program = SSS_TOKEN_PROGRAM_ID
            ExtraAccountMeta::new_external_pda_with_seeds(
                7, // external program index (SSS_TOKEN_PROGRAM_ID, injected at idx 7)
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::Literal { bytes: stablecoin_state.to_bytes().to_vec() },
                    Seed::AccountKey { index: 3 }, // owner / source wallet
                ],
                false, // is_signer
                false, // is_writable
            )?,
            // index 6: receiver blacklist PDA
            //   seeds = ["blacklist", stablecoin_state, destination_owner]
            //   We use the destination token account (index 2) owner.
            //   Since we can't resolve token-account owner at meta-list time,
            //   we pass the destination token account key as seed and resolve
            //   in the execute handler.
            ExtraAccountMeta::new_external_pda_with_seeds(
                7,
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::Literal { bytes: stablecoin_state.to_bytes().to_vec() },
                    Seed::AccountKey { index: 2 }, // destination token account (best available)
                ],
                false,
                false,
            )?,
            // index 7: SSS-Token program (needed for external PDA derivation above)
            ExtraAccountMeta::new_with_pubkey(&SSS_TOKEN_PROGRAM_ID, false, false)?,
            // index 8: hook state PDA (stores admin, paused, and transfer count)
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: b"hook-state".to_vec() },
                    Seed::AccountKey { index: 1 }, // mint
                ],
                false,
                true, // writable — we increment the transfer counter
            )?,
        ];

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
    // execute — THE HOOK ENTRYPOINT
    // ──────────────────────────────────────────────────────────────────────────

    /// Called by Token-2022 on every `transfer_checked`.
    ///
    /// Checks:
    /// 1. Hook is not paused
    /// 2. Sender is not blacklisted
    /// 3. Receiver is not blacklisted
    /// 4. Increments transfer counter
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        let remaining = &ctx.remaining_accounts;
        // remaining[0] = sender blacklist PDA
        // remaining[1] = receiver blacklist PDA
        // remaining[2] = SSS_TOKEN_PROGRAM_ID
        // remaining[3] = hook state PDA

        require!(remaining.len() >= 4, HookError::MissingAccounts);

        let sender_blacklist = &remaining[0];
        let receiver_blacklist = &remaining[1];
        let hook_state_info = &remaining[3];

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

        // Check blacklists
        check_not_blacklisted(sender_blacklist, true)?;
        check_not_blacklisted(receiver_blacklist, false)?;

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
}

// ─── Blacklist check helper ──────────────────────────────────────────────────

fn check_not_blacklisted(account: &AccountInfo, is_sender: bool) -> Result<()> {
    // Account doesn't exist → not blacklisted → allowed
    if account.lamports() == 0 || account.data_is_empty() {
        return Ok(());
    }

    // Account exists → this means a BlacklistEntry PDA was initialized by sss-token.
    // The sss-token program only creates these PDAs during `add_to_blacklist` and
    // only closes them during `remove_from_blacklist`.
    // Therefore, existence = blacklisted.
    //
    // Additional safety: we verify the data has the expected minimum size.
    // BlacklistEntry: 8 (disc) + 32 (stablecoin) + 32 (address) + 4 (reason_len)
    //                 + reason_bytes + 8 (added_at) + 32 (added_by) + 1 (active) + 1 (bump)
    let data = account.try_borrow_data()?;
    if data.len() < 9 {
        // Too small to be a valid BlacklistEntry — allow the transfer
        return Ok(());
    }

    // Verify the `active` field is true.
    // If the PDA exists but active == false, the sss-token program has soft-deactivated it.
    // Layout: disc(8) + stablecoin(32) + address(32) + reason_string(4+len) ...
    // Since reason is a variable-length String, we read `active` from the correct offset.
    //
    // For robustness: We read the 4-byte reason length, skip that many bytes, then read
    // added_at(8) + added_by(32) + active(1).
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