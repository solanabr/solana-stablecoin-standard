use anchor_lang::prelude::*;
use anchor_lang::system_program;
use spl_tlv_account_resolution::{account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

declare_id!("phAtzRyRUJGpMC3ftAtWzoaX7UkghRe9x5KTig8jPQp");

// ---------------------------------------------------------------------------
// Constants mirrored from sss-token/src/state.rs
// Kept in sync manually — update here whenever state.rs changes.
// ---------------------------------------------------------------------------

/// Discriminator for StablecoinConfig accounts (first 8 bytes of sha256("account:StablecoinConfig")).
/// Computed: sha256(b"account:StablecoinConfig")[0..8] = 7f19f4d501c06506
const STABLECOIN_CONFIG_DISCRIMINATOR: [u8; 8] = [0x7f, 0x19, 0xf4, 0xd5, 0x01, 0xc0, 0x65, 0x06];

/// Byte offset of `feature_flags` within StablecoinConfig account data.
/// Borsh serialization (no alignment padding):
///   discriminator                  8   @ 0
///   mint         Pubkey           32   @ 8
///   authority    Pubkey           32   @ 40
///   compliance_authority Pubkey   32   @ 72
///   preset       u8                1   @ 104
///   paused       bool              1   @ 105
///   total_minted u64               8   @ 106
///   total_burned u64               8   @ 114
///   transfer_hook_program Pubkey  32   @ 122
///   collateral_mint Pubkey        32   @ 154
///   reserve_vault Pubkey          32   @ 186
///   total_collateral u64           8   @ 218
///   max_supply   u64               8   @ 226
///   pending_authority Pubkey      32   @ 234
///   pending_compliance_authority  32   @ 266
///   feature_flags u64              8   @ 298  <--
///   max_transfer_amount u64        8   @ 306  <--
///   bump         u8                1   @ 314
const FEATURE_FLAGS_OFFSET: usize = 298;
const MAX_TRANSFER_AMOUNT_OFFSET: usize = 306;

/// FLAG_SPEND_POLICY bit in feature_flags (bit 1 = 1 << 1).
const FLAG_SPEND_POLICY: u64 = 1 << 1;

/// FLAG_ZK_COMPLIANCE bit in feature_flags (bit 4 = 1 << 4).
const FLAG_ZK_COMPLIANCE: u64 = 1 << 4;

/// PDA seed for VerificationRecord in the sss-token program.
const ZK_VERIFICATION_SEED: &[u8] = b"zk-verification";

/// Byte offsets within VerificationRecord account data (Borsh layout):
///   discriminator          8  @ 0
///   sss_mint  Pubkey      32  @ 8
///   user      Pubkey      32  @ 40
///   expires_at_slot u64    8  @ 72
///   bump      u8           1  @ 80
const ZK_RECORD_EXPIRES_OFFSET: usize = 72;
const ZK_RECORD_MIN_SIZE: usize = 80;

/// PDA seed for StablecoinConfig in the sss-token program.
const STABLECOIN_CONFIG_SEED: &[u8] = b"stablecoin-config";

/// sss-token program ID (for PDA derivation of StablecoinConfig).
/// Used to verify the stablecoin_config PDA address in transfer_hook.
pub mod sss_token_program {
    use anchor_lang::declare_id;
    declare_id!("AxE9NQ8z6tzNJT9AHBu2YRsVqX41uCjPmpN5RLavAaat");
}

/// SSS-2 Transfer Hook — enforces blacklist and spend policy on every transfer.
///
/// This program is invoked by Token-2022 on every transfer for mints
/// that have registered this as their transfer hook.
///
/// Token-2022 Transfer Hook Interface:
/// - `initialize_extra_account_meta_list` sets up the canonical PDA at
///   seeds [b"extra-account-metas", mint] telling Token-2022 which extra
///   accounts to resolve and pass when invoking the hook.
/// - `transfer_hook` (with `#[interface]` attribute) is the execute entry
///   point. Token-2022 dispatches here using the SPL discriminator.
#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Called by Token-2022 on every transfer.
    ///
    /// CRITICAL: The `#[interface(spl_transfer_hook_interface::execute)]`
    /// attribute makes Anchor emit the correct SPL discriminator so Token-2022
    /// can find and invoke this instruction.
    ///
    /// Checks performed (in order):
    ///   1. Sender not blacklisted
    ///   2. Receiver not blacklisted
    ///   3. If FLAG_SPEND_POLICY is set: amount ≤ max_transfer_amount
    ///
    /// Accounts (in Token-2022's required order):
    ///   0. source_token_account
    ///   1. mint
    ///   2. destination_token_account
    ///   3. owner (source owner/delegate)
    ///   4. extra_account_meta_list (validation account)
    ///   5. blacklist_state       — PDA [b"blacklist-state", mint]
    ///   6. stablecoin_config     — PDA [b"stablecoin-config", mint] (sss-token program)
    #[interface(spl_transfer_hook_interface::execute)]
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        let blacklist = &ctx.accounts.blacklist_state;

        // Check sender — read owner from Token-2022 token account layout (owner at offset 32..64)
        let src_data = ctx.accounts.source_token_account.try_borrow_data()?;
        let src_owner =
            Pubkey::try_from(&src_data[32..64]).map_err(|_| error!(HookError::SenderBlacklisted))?;
        require!(
            !blacklist.is_blacklisted(&src_owner),
            HookError::SenderBlacklisted
        );

        // Check receiver
        let dst_data = ctx.accounts.destination_token_account.try_borrow_data()?;
        let dst_owner =
            Pubkey::try_from(&dst_data[32..64]).map_err(|_| error!(HookError::ReceiverBlacklisted))?;
        require!(
            !blacklist.is_blacklisted(&dst_owner),
            HookError::ReceiverBlacklisted
        );

        // --- Spend policy check ---
        // Read feature_flags and max_transfer_amount from StablecoinConfig via
        // manual byte-level deserialization (avoids cross-program crate dep).
        {
            // Verify the stablecoin_config PDA is derived from the expected program + seeds.
            let (expected_pda, _bump) = Pubkey::find_program_address(
                &[STABLECOIN_CONFIG_SEED, ctx.accounts.mint.key().as_ref()],
                &sss_token_program::ID,
            );
            require!(
                ctx.accounts.stablecoin_config.key() == expected_pda,
                HookError::InvalidConfig
            );

            let config_data = ctx.accounts.stablecoin_config.try_borrow_data()?;
            // Verify discriminator and minimum size
            require!(
                config_data.len() >= MAX_TRANSFER_AMOUNT_OFFSET + 8,
                HookError::InvalidConfig
            );
            require!(
                &config_data[0..8] == &STABLECOIN_CONFIG_DISCRIMINATOR,
                HookError::InvalidConfig
            );
            let feature_flags = u64::from_le_bytes(
                config_data[FEATURE_FLAGS_OFFSET..FEATURE_FLAGS_OFFSET + 8]
                    .try_into()
                    .unwrap(),
            );
            if feature_flags & FLAG_SPEND_POLICY != 0 {
                let max_transfer_amount = u64::from_le_bytes(
                    config_data[MAX_TRANSFER_AMOUNT_OFFSET..MAX_TRANSFER_AMOUNT_OFFSET + 8]
                        .try_into()
                        .unwrap(),
                );
                require!(
                    amount <= max_transfer_amount,
                    HookError::SpendLimitExceeded
                );
                msg!(
                    "SpendPolicy OK: {} <= max {}",
                    amount,
                    max_transfer_amount
                );
            }

            // --- ZK compliance check ---
            // If FLAG_ZK_COMPLIANCE is set, the sender must have a valid, non-expired
            // VerificationRecord PDA at seeds [b"zk-verification", mint, src_owner].
            if feature_flags & FLAG_ZK_COMPLIANCE != 0 {
                let vr_account = &ctx.accounts.verification_record;
                // Verify the PDA address
                let (expected_vr_pda, _bump) = Pubkey::find_program_address(
                    &[
                        ZK_VERIFICATION_SEED,
                        ctx.accounts.mint.key().as_ref(),
                        src_owner.as_ref(),
                    ],
                    &sss_token_program::ID,
                );
                require!(
                    vr_account.key() == expected_vr_pda,
                    HookError::ZkRecordMissing
                );
                let vr_data = vr_account.try_borrow_data()?;
                require!(
                    vr_data.len() >= ZK_RECORD_MIN_SIZE,
                    HookError::ZkRecordMissing
                );
                let clock = Clock::get()?;
                let expires_at = u64::from_le_bytes(
                    vr_data[ZK_RECORD_EXPIRES_OFFSET..ZK_RECORD_EXPIRES_OFFSET + 8]
                        .try_into()
                        .unwrap(),
                );
                require!(
                    clock.slot < expires_at,
                    HookError::ZkRecordExpired
                );
                msg!(
                    "ZkCompliance OK: sender {} verified until slot {}",
                    src_owner,
                    expires_at
                );
            }
        }

        msg!("Transfer hook: {} tokens OK", amount);
        Ok(())
    }

    /// Initialize the ExtraAccountMetaList and the blacklist state.
    ///
    /// Must be called once after mint creation (SSS-2 preset) before any
    /// transfers can occur.
    ///
    /// This creates the canonical `extra_account_meta_list` PDA at seeds
    /// [b"extra-account-metas", mint] that Token-2022 looks up on every
    /// transfer to know which additional accounts to resolve and forward.
    ///
    /// Extra accounts registered (resolved by Token-2022 at transfer time):
    ///   5. blacklist_state        — seeds [b"blacklist-state", mint (index 1)]
    ///   6. stablecoin_config      — seeds [b"stablecoin-config", mint (index 1)] (sss-token program)
    ///   7. verification_record    — seeds [b"zk-verification", mint (index 1), owner (index 3)] (sss-token program)
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Build the extra account list:
        // In the Execute instruction accounts:
        //   index 0 = source_token_account
        //   index 1 = mint
        //   index 2 = destination_token_account
        //   index 3 = owner
        //   index 4 = extra_account_meta_list (validation account itself)
        //   index 5 = blacklist_state    (our extra #1)
        //   index 6 = stablecoin_config  (our extra #2)
        let account_metas = vec![
            // blacklist_state PDA: seeds = [b"blacklist-state", mint (index 1)]
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: b"blacklist-state".to_vec(),
                    },
                    Seed::AccountKey { index: 1 }, // mint is at index 1
                ],
                false, // is_signer
                false, // is_writable
            )?,
            // stablecoin_config PDA: seeds = [b"stablecoin-config", mint (index 1)]
            // owned by sss-token program — resolved by Token-2022 from seeds
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: b"stablecoin-config".to_vec(),
                    },
                    Seed::AccountKey { index: 1 }, // mint is at index 1
                ],
                false, // is_signer
                false, // is_writable
            )?,
            // verification_record PDA: seeds = [b"zk-verification", mint (index 1), owner (index 3)]
            // owned by sss-token program — only enforced when FLAG_ZK_COMPLIANCE is set
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: b"zk-verification".to_vec(),
                    },
                    Seed::AccountKey { index: 1 }, // mint is at index 1
                    Seed::AccountKey { index: 3 }, // owner (source owner) is at index 3
                ],
                false, // is_signer
                false, // is_writable
            )?,
        ];

        // Calculate space required for the ExtraAccountMetaList TLV data
        let account_size = ExtraAccountMetaList::size_of(account_metas.len())? as u64;

        // Fund the extra_account_meta_list PDA
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(account_size as usize);

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
            ),
            lamports,
        )?;

        // Allocate space
        {
            let extra_meta_info = ctx.accounts.extra_account_meta_list.to_account_info();
            extra_meta_info.realloc(account_size as usize, false)
                .map_err(|_| error!(HookError::SenderBlacklisted))?;
        }

        // Write the ExtraAccountMetaList data
        {
            let mut data = ctx
                .accounts
                .extra_account_meta_list
                .try_borrow_mut_data()?;
            ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &account_metas)?;
        }

        // Initialize the blacklist state PDA
        let bl = &mut ctx.accounts.blacklist_state;
        bl.mint = ctx.accounts.mint.key();
        bl.authority = ctx.accounts.authority.key();
        bl.blacklisted = Vec::new();
        bl.bump = ctx.bumps.blacklist_state;

        msg!(
            "TransferHook initialized: mint={} extra_account_meta_list={}",
            ctx.accounts.mint.key(),
            ctx.accounts.extra_account_meta_list.key()
        );

        Ok(())
    }

    /// Add an address to the blacklist.
    pub fn blacklist_add(ctx: Context<ManageBlacklist>, address: Pubkey) -> Result<()> {
        let bl = &mut ctx.accounts.blacklist_state;
        if !bl.blacklisted.contains(&address) {
            bl.blacklisted.push(address);
        }
        msg!("Blacklisted {}", address);
        Ok(())
    }

    /// Remove an address from the blacklist.
    pub fn blacklist_remove(ctx: Context<ManageBlacklist>, address: Pubkey) -> Result<()> {
        let bl = &mut ctx.accounts.blacklist_state;
        bl.blacklisted.retain(|a| *a != address);
        msg!("Removed {} from blacklist", address);
        Ok(())
    }
}

#[error_code]
pub enum HookError {
    #[msg("Sender is blacklisted")]
    SenderBlacklisted,
    #[msg("Receiver is blacklisted")]
    ReceiverBlacklisted,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Spend policy: transfer amount exceeds max_transfer_amount")]
    SpendLimitExceeded,
    #[msg("Invalid stablecoin config account (wrong discriminator or size)")]
    InvalidConfig,
    #[msg("ZK compliance: sender has no valid verification record")]
    ZkRecordMissing,
    #[msg("ZK compliance: sender's verification record has expired")]
    ZkRecordExpired,
}

/// Blacklist state PDA for a given mint.
#[account]
pub struct BlacklistState {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub blacklisted: Vec<Pubkey>,
    pub bump: u8,
}

impl BlacklistState {
    pub const SEED: &'static [u8] = b"blacklist-state";

    pub fn is_blacklisted(&self, address: &Pubkey) -> bool {
        self.blacklisted.contains(address)
    }

    /// Space: discriminator(8) + mint(32) + authority(32) + vec_len(4) + 100*32 + u8(1)
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 4 + (100 * 32) + 1;
}

/// Accounts for the transfer hook execute instruction.
///
/// MUST match Token-2022's expected layout for the Execute instruction:
///   0. source_token_account
///   1. mint
///   2. destination_token_account
///   3. owner (source owner/delegate)
///   4. extra_account_meta_list (validation account, passed by Token-2022)
///   5. blacklist_state        — resolved by Token-2022 from extra_account_meta_list
///   6. stablecoin_config      — resolved by Token-2022 from extra_account_meta_list
///   7. verification_record    — resolved by Token-2022 from extra_account_meta_list
///
/// All of 0-4 are passed and validated by Token-2022 itself; we use
/// UncheckedAccount + CHECK comments as required by Anchor's safety linter.
#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: Source token account — Token-2022 validates this before calling hook
    pub source_token_account: UncheckedAccount<'info>,

    /// CHECK: Token-2022 mint — Token-2022 validates this before calling hook
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Destination token account — Token-2022 validates this before calling hook
    pub destination_token_account: UncheckedAccount<'info>,

    /// CHECK: Owner/delegate of source account — Token-2022 validates this before calling hook
    pub owner: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetaList PDA — contains the list of extra accounts for this hook
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// Blacklist state — resolved by Token-2022 from extra_account_meta_list using PDA seeds
    #[account(
        seeds = [BlacklistState::SEED, mint.key().as_ref()],
        bump = blacklist_state.bump,
    )]
    pub blacklist_state: Account<'info, BlacklistState>,

    /// CHECK: StablecoinConfig PDA from sss-token program — seeds [b"stablecoin-config", mint].
    /// Resolved by Token-2022 from extra_account_meta_list. We manually verify the
    /// PDA address and discriminator in transfer_hook before reading feature_flags.
    pub stablecoin_config: UncheckedAccount<'info>,

    /// CHECK: VerificationRecord PDA from sss-token program —
    /// seeds [b"zk-verification", mint, source_owner].
    /// Resolved by Token-2022 from extra_account_meta_list (index 7).
    /// Only enforced when FLAG_ZK_COMPLIANCE is set; we manually verify PDA
    /// address and expiry in transfer_hook.
    pub verification_record: UncheckedAccount<'info>,
}

/// Accounts for initializing the ExtraAccountMetaList and blacklist state.
#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The Token-2022 mint (already created by sss-token program)
    pub mint: UncheckedAccount<'info>,

    /// CHECK: The canonical extra-account-metas PDA that Token-2022 looks up on every transfer.
    /// We write ExtraAccountMetaList TLV data into it; no Anchor type validation needed.
    /// Seeds: [b"extra-account-metas", mint]
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// Blacklist state PDA — initialized here alongside the meta list.
    #[account(
        init,
        payer = authority,
        space = BlacklistState::INIT_SPACE,
        seeds = [BlacklistState::SEED, mint.key().as_ref()],
        bump,
    )]
    pub blacklist_state: Account<'info, BlacklistState>,

    pub system_program: Program<'info, System>,
}

/// Accounts for managing the blacklist.
#[derive(Accounts)]
pub struct ManageBlacklist<'info> {
    pub authority: Signer<'info>,

    /// CHECK: The Token-2022 mint
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [BlacklistState::SEED, mint.key().as_ref()],
        bump = blacklist_state.bump,
        constraint = blacklist_state.authority == authority.key() @ HookError::Unauthorized,
    )]
    pub blacklist_state: Account<'info, BlacklistState>,
}
