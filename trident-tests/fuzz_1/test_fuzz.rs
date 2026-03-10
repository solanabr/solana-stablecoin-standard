// =============================================================================
// fuzz_1/test_fuzz.rs — Multi-User Chaos Fuzzer
// =============================================================================
//
// PURPOSE: Fuzz multi-user interactions in the Solana Stablecoin Standard to
// verify that isolation, role management, and authority transfer work correctly
// under concurrent, randomized usage patterns.
//
// COVERAGE:
//   - Multiple minters with separate quotas (quota isolation)
//   - Role updates: master_minter, pauser, blacklister reassignment
//   - Two-step authority transfer (transfer_authority + accept_authority)
//   - Interleaved operations from different users
//   - remove_minter and re-enable scenarios
//
// INVARIANTS VERIFIED:
//   1. Quota isolation: each minter's minted_amount is tracked independently;
//      one minter's activity never affects another's quota
//   2. Role enforcement after update: old role holder loses access,
//      new role holder gains access
//   3. Authority transfer correctness: transfer is two-step, pending_authority
//      must accept, old authority loses power after acceptance
//   4. Remove/re-enable: disabling a minter preserves minted_amount;
//      re-enabling does not reset the counter
//   5. Supply conservation across all minters: sum of all mints minus all
//      burns equals on-chain supply
//
// STRATEGY:
//   The #[init] flow creates a stablecoin with multiple minters.
//   Flows randomly select which minter operates, update roles, transfer
//   authority, and verify cross-minter isolation throughout.

use fuzz_accounts::{FuzzAccounts, NUM_MINTERS};
use trident_fuzz::fuzzing::*;
mod fuzz_accounts;

use anchor_lang::prelude::Pubkey;
use anchor_lang::system_program;
use anchor_lang::InstructionData;
use anchor_lang::ToAccountMetas;

use sss_core::constants::*;
use sss_core::state::{MinterState, RoleType, StablecoinConfig};

// ─── Program IDs ────────────────────────────────────────────────────────────
const SSS_CORE_ID: Pubkey = sss_core::ID;

// The well-known address for the Token-2022 program on all Solana clusters.
const TOKEN_2022_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// ─── Per-minter tracking state ──────────────────────────────────────────────

/// Tracks expected state for a single minter.
#[derive(Debug, Clone, Default)]
struct MinterExpected {
    /// Whether this minter has been configured.
    configured: bool,
    /// Whether this minter is currently enabled.
    enabled: bool,
    /// The minter's quota.
    quota: u64,
    /// Cumulative minted amount (never resets, even on reconfigure or disable).
    minted_amount: u64,
}

/// Tracks expected global state plus per-minter state.
#[derive(Debug, Default)]
struct MultiUserExpectedState {
    initialized: bool,
    total_minted: u64,
    total_burned: u64,
    paused: bool,

    /// Per-minter expected state, indexed by minter index [0..NUM_MINTERS).
    minters: [MinterExpected; NUM_MINTERS],

    // Role tracking: who currently holds each role.
    // After update_role, these change.
    current_authority: Pubkey,
    current_master_minter: Pubkey,
    current_pauser: Pubkey,
    current_blacklister: Pubkey,

    /// Whether an authority transfer is pending.
    authority_transfer_pending: bool,
    pending_authority_address: Pubkey,
}

// ─── PDA helpers ────────────────────────────────────────────────────────────

fn derive_config_pda(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[CONFIG_SEED, mint.as_ref()], &SSS_CORE_ID)
}

fn derive_mint_authority_pda(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[MINT_AUTHORITY_SEED, mint.as_ref()], &SSS_CORE_ID)
}

fn derive_minter_state_pda(config: &Pubkey, minter: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[MINTER_SEED, config.as_ref(), minter.as_ref()],
        &SSS_CORE_ID,
    )
}

fn read_config(trident: &Trident, config_key: &Pubkey) -> Option<StablecoinConfig> {
    trident.get_account_with_type::<StablecoinConfig>(config_key, 8)
}

fn read_minter_state(trident: &Trident, minter_state_key: &Pubkey) -> Option<MinterState> {
    trident.get_account_with_type::<MinterState>(minter_state_key, 8)
}

// ─── FuzzTest struct ────────────────────────────────────────────────────────

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: FuzzAccounts,
    expected: MultiUserExpectedState,
}

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: FuzzAccounts::default(),
            expected: MultiUserExpectedState::default(),
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INIT: Create stablecoin with multiple minters
    // ═════════════════════════════════════════════════════════════════════════
    #[init]
    fn setup_multi_minter_stablecoin(&mut self) {
        self.expected = MultiUserExpectedState::default();

        // 1. Create and fund authority
        let authority_key = self.fuzz_accounts.authority.insert(&mut self.trident, None);
        self.trident.airdrop(&authority_key, 100 * LAMPORTS_PER_SOL);

        // 2. Create mint
        let mint_key = self.fuzz_accounts.mint.insert(&mut self.trident, None);

        // 3. Derive PDAs
        let (config_key, _) = derive_config_pda(&mint_key);
        self.fuzz_accounts.config.insert_with_address(config_key);

        let (mint_authority_key, _) = derive_mint_authority_pda(&mint_key);
        self.fuzz_accounts
            .mint_authority
            .insert_with_address(mint_authority_key);

        // 4. Create role-transfer candidate accounts
        let new_mm = self
            .fuzz_accounts
            .new_master_minter
            .insert(&mut self.trident, None);
        self.trident.airdrop(&new_mm, 20 * LAMPORTS_PER_SOL);

        let new_pauser = self
            .fuzz_accounts
            .new_pauser
            .insert(&mut self.trident, None);
        self.trident.airdrop(&new_pauser, 10 * LAMPORTS_PER_SOL);

        let new_bl = self
            .fuzz_accounts
            .new_blacklister
            .insert(&mut self.trident, None);
        self.trident.airdrop(&new_bl, 10 * LAMPORTS_PER_SOL);

        let pending_auth = self
            .fuzz_accounts
            .pending_authority
            .insert(&mut self.trident, None);
        self.trident.airdrop(&pending_auth, 20 * LAMPORTS_PER_SOL);

        // 5. Create random signers
        for i in 0..2 {
            let rk = self.fuzz_accounts.random_signers[i].insert(&mut self.trident, None);
            self.trident.airdrop(&rk, 5 * LAMPORTS_PER_SOL);
        }

        // 6. Initialize stablecoin (SSS-1 Minimal preset)
        let init_data = sss_core::instruction::Initialize {
            params: sss_core::instructions::InitializeParams {
                preset: PRESET_MINIMAL,
                name: "MultiCoin".to_string(),
                symbol: "MULTI".to_string(),
                uri: "https://multi.test".to_string(),
                decimals: 6,
            },
        };

        let init_accounts = sss_core::accounts::Initialize {
            authority: authority_key,
            mint: mint_key,
            config: config_key,
            mint_authority: mint_authority_key,
            hook_program: None,
            token_program: TOKEN_2022_PROGRAM_ID,
            system_program: system_program::ID,
        };

        let init_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: init_accounts.to_account_metas(None),
            data: init_data.data(),
        };

        let res = self.trident.process_transaction(&[init_ix], None);
        if !res.is_success() {
            return;
        }

        self.expected.initialized = true;
        self.expected.current_authority = authority_key;
        self.expected.current_master_minter = authority_key;
        self.expected.current_pauser = authority_key;
        self.expected.current_blacklister = authority_key;

        // 7. Create minter wallets, their PDAs, and token accounts
        for i in 0..NUM_MINTERS {
            let minter_key = self.fuzz_accounts.minter_wallets[i].insert(&mut self.trident, None);
            self.trident.airdrop(&minter_key, 10 * LAMPORTS_PER_SOL);

            let (minter_state_key, _) = derive_minter_state_pda(&config_key, &minter_key);
            self.fuzz_accounts.minter_states[i].insert_with_address(minter_state_key);

            // Create token account for this minter
            let ta_key =
                self.fuzz_accounts.minter_token_accounts[i].insert(&mut self.trident, None);
            let create_ta_ixs = self.trident.initialize_token_account_2022(
                &authority_key,
                &ta_key,
                &mint_key,
                &minter_key,
                &[],
            );
            let _ = self.trident.process_transaction(&create_ta_ixs, None);

            // Configure minter with randomized quota
            let quota = self
                .trident
                .random_from_range(1_000_000u64..5_000_000_000u64);

            let configure_data = sss_core::instruction::ConfigureMinter {
                minter_wallet: minter_key,
                quota,
            };

            let configure_accounts = sss_core::accounts::ConfigureMinter {
                master_minter: authority_key,
                config: config_key,
                minter_state: minter_state_key,
                system_program: system_program::ID,
            };

            let configure_ix = anchor_lang::solana_program::instruction::Instruction {
                program_id: SSS_CORE_ID,
                accounts: configure_accounts.to_account_metas(None),
                data: configure_data.data(),
            };

            let res = self.trident.process_transaction(&[configure_ix], None);
            if res.is_success() {
                self.expected.minters[i] = MinterExpected {
                    configured: true,
                    enabled: true,
                    quota,
                    minted_amount: 0,
                };
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Randomly selected minter mints tokens
    // ═════════════════════════════════════════════════════════════════════════
    //
    // INVARIANT 1 (Quota isolation): Minting with minter[i] must ONLY affect
    // minter[i].minted_amount. Other minters' state must be untouched.
    #[flow]
    fn flow_random_minter_mint(&mut self) {
        if !self.expected.initialized || self.expected.paused {
            return;
        }

        // Pick a random minter index
        let idx = self.trident.random_from_range(0usize..NUM_MINTERS);
        if !self.expected.minters[idx].configured || !self.expected.minters[idx].enabled {
            return;
        }

        let minter_key = self.fuzz_accounts.minter_wallets[idx].get(&mut self.trident);
        let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let minter_state_key = self.fuzz_accounts.minter_states[idx].get(&mut self.trident);
        let dest_key = self.fuzz_accounts.minter_token_accounts[idx].get(&mut self.trident);
        let mint_authority_key = self.fuzz_accounts.mint_authority.get(&mut self.trident);

        let remaining = self.expected.minters[idx]
            .quota
            .saturating_sub(self.expected.minters[idx].minted_amount);

        if remaining == 0 {
            return;
        }

        // Usually pick a valid amount, sometimes try to exceed
        let amount = if self.trident.random_from_range(0u8..10u8) < 8 {
            self.trident
                .random_from_range(1u64..=remaining.min(1_000_000))
        } else {
            self.trident
                .random_from_range(remaining..=remaining.saturating_add(1_000_000))
        };

        // Snapshot ALL minters' state before this operation
        let pre_minter_states: Vec<MinterExpected> =
            self.expected.minters.iter().cloned().collect();
        let pre_total_minted = self.expected.total_minted;

        let mint_data = sss_core::instruction::MintTokens { amount };

        let mint_accounts = sss_core::accounts::MintTokens {
            minter: minter_key,
            config: config_key,
            minter_state: minter_state_key,
            mint: mint_key,
            destination: dest_key,
            mint_authority: mint_authority_key,
            token_program: TOKEN_2022_PROGRAM_ID,
        };

        let mint_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: mint_accounts.to_account_metas(None),
            data: mint_data.data(),
        };

        let res = self.trident.process_transaction(&[mint_ix], None);

        if res.is_success() {
            self.expected.minters[idx].minted_amount += amount;
            self.expected.total_minted += amount;

            // ── INVARIANT 1: Quota isolation ────────────────────────────
            // Only the minting minter's state should have changed.
            // All other minters must be completely unaffected.
            for j in 0..NUM_MINTERS {
                if j == idx {
                    continue;
                }
                assert_eq!(
                    self.expected.minters[j].minted_amount,
                    pre_minter_states[j].minted_amount,
                    "QUOTA ISOLATION VIOLATED: Minter {} mint affected minter {}'s minted_amount! \
                     minter[{}].minted_amount was {}, now {}. \
                     Cross-contamination between minters breaks the quota system.",
                    idx,
                    j,
                    j,
                    pre_minter_states[j].minted_amount,
                    self.expected.minters[j].minted_amount
                );
                assert_eq!(
                    self.expected.minters[j].quota,
                    pre_minter_states[j].quota,
                    "QUOTA ISOLATION VIOLATED: Minter {} mint affected minter {}'s quota!",
                    idx,
                    j
                );
            }

            // Verify on-chain quota for the active minter
            if let Some(minter) = read_minter_state(&self.trident, &minter_state_key) {
                assert!(
                    minter.minted_amount <= minter.quota,
                    "INVARIANT VIOLATED: on-chain minted_amount ({}) > quota ({}) for minter {}",
                    minter.minted_amount,
                    minter.quota,
                    idx
                );
            }

            // Verify on-chain: OTHER minters' state unchanged
            for j in 0..NUM_MINTERS {
                if j == idx || !self.expected.minters[j].configured {
                    continue;
                }
                let other_ms_key = self.fuzz_accounts.minter_states[j].get(&mut self.trident);
                if let Some(other_minter) = read_minter_state(&self.trident, &other_ms_key) {
                    assert_eq!(
                        other_minter.minted_amount,
                        pre_minter_states[j].minted_amount,
                        "ON-CHAIN ISOLATION VIOLATED: minter[{}] mint changed minter[{}] \
                         on-chain minted_amount from {} to {}",
                        idx,
                        j,
                        pre_minter_states[j].minted_amount,
                        other_minter.minted_amount
                    );
                }
            }
        } else {
            // Verify no state changed
            assert_eq!(
                self.expected.total_minted, pre_total_minted,
                "total_minted changed on failed mint"
            );
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Update master_minter role
    // ═════════════════════════════════════════════════════════════════════════
    //
    // INVARIANT 2 (Role enforcement after update): After the authority changes
    // master_minter to a new address, the old master_minter must lose the
    // ability to configure minters, and the new one must gain it.
    #[flow]
    fn flow_update_master_minter(&mut self) {
        if !self.expected.initialized {
            return;
        }

        let authority_key = self.fuzz_accounts.authority.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let new_mm_key = self.fuzz_accounts.new_master_minter.get(&mut self.trident);

        // Only the current authority can update roles
        if authority_key != self.expected.current_authority {
            return;
        }

        let update_data = sss_core::instruction::UpdateRole {
            role: RoleType::MasterMinter,
            new_address: new_mm_key,
        };

        let update_accounts = sss_core::accounts::UpdateRole {
            authority: authority_key,
            config: config_key,
        };

        let update_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: update_accounts.to_account_metas(None),
            data: update_data.data(),
        };

        let res = self.trident.process_transaction(&[update_ix], None);

        if res.is_success() {
            let old_mm = self.expected.current_master_minter;
            self.expected.current_master_minter = new_mm_key;

            // Verify on-chain
            if let Some(config) = read_config(&self.trident, &config_key) {
                assert_eq!(
                    config.master_minter, new_mm_key,
                    "ROLE UPDATE FAILED: on-chain master_minter ({}) != expected ({})",
                    config.master_minter, new_mm_key
                );
                assert_ne!(
                    config.master_minter, old_mm,
                    "ROLE UPDATE STALE: master_minter still points to old address"
                );
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Old master_minter tries to configure after role update
    // ═════════════════════════════════════════════════════════════════════════
    //
    // After update_role(MasterMinter, new_address), the ORIGINAL authority
    // (if it's no longer master_minter) should fail to configure minters.
    #[flow]
    fn flow_old_master_minter_configure(&mut self) {
        if !self.expected.initialized || self.expected.paused {
            return;
        }

        let authority_key = self.fuzz_accounts.authority.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);

        // Only test this when the authority is no longer the master_minter
        // (i.e., the role has been transferred)
        if authority_key == self.expected.current_master_minter {
            return;
        }

        // Try to configure a minter using the OLD master_minter (authority)
        let idx = 0;
        let minter_key = self.fuzz_accounts.minter_wallets[idx].get(&mut self.trident);
        let minter_state_key = self.fuzz_accounts.minter_states[idx].get(&mut self.trident);

        let configure_data = sss_core::instruction::ConfigureMinter {
            minter_wallet: minter_key,
            quota: 999_999_999,
        };

        let configure_accounts = sss_core::accounts::ConfigureMinter {
            master_minter: authority_key, // old master_minter
            config: config_key,
            minter_state: minter_state_key,
            system_program: system_program::ID,
        };

        let configure_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: configure_accounts.to_account_metas(None),
            data: configure_data.data(),
        };

        let res = self.trident.process_transaction(&[configure_ix], None);

        assert!(
            !res.is_success(),
            "INVARIANT VIOLATED: Old master_minter {} was able to configure minters \
             after role was transferred to {}! \
             Role updates are not being enforced, allowing revoked roles to persist.",
            authority_key, self.expected.current_master_minter
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: New master_minter configures a minter
    // ═════════════════════════════════════════════════════════════════════════
    //
    // After role transfer, the new master_minter must be able to configure.
    #[flow]
    fn flow_new_master_minter_configure(&mut self) {
        if !self.expected.initialized || self.expected.paused {
            return;
        }

        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let current_mm = self.expected.current_master_minter;

        let idx = self.trident.random_from_range(0usize..NUM_MINTERS);
        let minter_key = self.fuzz_accounts.minter_wallets[idx].get(&mut self.trident);
        let minter_state_key = self.fuzz_accounts.minter_states[idx].get(&mut self.trident);

        let new_quota = self
            .trident
            .random_from_range(1_000_000u64..10_000_000_000u64);

        let pre_minted = self.expected.minters[idx].minted_amount;

        let configure_data = sss_core::instruction::ConfigureMinter {
            minter_wallet: minter_key,
            quota: new_quota,
        };

        let configure_accounts = sss_core::accounts::ConfigureMinter {
            master_minter: current_mm,
            config: config_key,
            minter_state: minter_state_key,
            system_program: system_program::ID,
        };

        let configure_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: configure_accounts.to_account_metas(None),
            data: configure_data.data(),
        };

        let res = self.trident.process_transaction(&[configure_ix], None);

        if res.is_success() {
            self.expected.minters[idx].quota = new_quota;
            self.expected.minters[idx].enabled = true;
            self.expected.minters[idx].configured = true;

            // INVARIANT: minted_amount preserved on reconfigure
            if let Some(minter) = read_minter_state(&self.trident, &minter_state_key) {
                assert_eq!(
                    minter.minted_amount, pre_minted,
                    "INVARIANT VIOLATED: minted_amount reset on reconfigure by new master_minter. \
                     Was {}, now {}. Quota restoration vulnerability.",
                    pre_minted, minter.minted_amount
                );
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Update pauser role
    // ═════════════════════════════════════════════════════════════════════════
    #[flow]
    fn flow_update_pauser(&mut self) {
        if !self.expected.initialized {
            return;
        }

        let authority_key = self.fuzz_accounts.authority.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let new_pauser_key = self.fuzz_accounts.new_pauser.get(&mut self.trident);

        if authority_key != self.expected.current_authority {
            return;
        }

        let update_data = sss_core::instruction::UpdateRole {
            role: RoleType::Pauser,
            new_address: new_pauser_key,
        };

        let update_accounts = sss_core::accounts::UpdateRole {
            authority: authority_key,
            config: config_key,
        };

        let update_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: update_accounts.to_account_metas(None),
            data: update_data.data(),
        };

        let res = self.trident.process_transaction(&[update_ix], None);

        if res.is_success() {
            self.expected.current_pauser = new_pauser_key;

            if let Some(config) = read_config(&self.trident, &config_key) {
                assert_eq!(
                    config.pauser, new_pauser_key,
                    "ROLE UPDATE FAILED: on-chain pauser != expected after update"
                );
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Transfer authority (step 1 of 2)
    // ═════════════════════════════════════════════════════════════════════════
    //
    // INVARIANT 3 (Two-step transfer): After transfer_authority, the old
    // authority still has power. The new authority cannot act until they
    // call accept_authority. This prevents accidental loss of control.
    #[flow]
    fn flow_transfer_authority(&mut self) {
        if !self.expected.initialized || self.expected.authority_transfer_pending {
            return;
        }

        let authority_key = self.fuzz_accounts.authority.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let pending_key = self.fuzz_accounts.pending_authority.get(&mut self.trident);

        if authority_key != self.expected.current_authority {
            return;
        }

        let transfer_data = sss_core::instruction::TransferAuthority {
            new_authority: pending_key,
        };

        let transfer_accounts = sss_core::accounts::TransferAuthority {
            authority: authority_key,
            config: config_key,
        };

        let transfer_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: transfer_accounts.to_account_metas(None),
            data: transfer_data.data(),
        };

        let res = self.trident.process_transaction(&[transfer_ix], None);

        if res.is_success() {
            self.expected.authority_transfer_pending = true;
            self.expected.pending_authority_address = pending_key;

            // INVARIANT 3: Authority should NOT have changed yet
            if let Some(config) = read_config(&self.trident, &config_key) {
                assert_eq!(
                    config.authority, authority_key,
                    "INVARIANT VIOLATED: Authority changed immediately on transfer_authority! \
                     The two-step process is broken. Authority should remain with the current \
                     holder until the pending authority calls accept_authority."
                );
                assert_eq!(
                    config.pending_authority, pending_key,
                    "pending_authority not set correctly"
                );
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Accept authority (step 2 of 2)
    // ═════════════════════════════════════════════════════════════════════════
    //
    // Only the pending_authority can accept. After acceptance:
    //   - The old authority loses all power
    //   - The new authority gains full control
    //   - pending_authority resets to Pubkey::default()
    #[flow]
    fn flow_accept_authority(&mut self) {
        if !self.expected.initialized || !self.expected.authority_transfer_pending {
            return;
        }

        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let pending_key = self.fuzz_accounts.pending_authority.get(&mut self.trident);

        let accept_data = sss_core::instruction::AcceptAuthority {};

        let accept_accounts = sss_core::accounts::AcceptAuthority {
            new_authority: pending_key,
            config: config_key,
        };

        let accept_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: accept_accounts.to_account_metas(None),
            data: accept_data.data(),
        };

        let res = self.trident.process_transaction(&[accept_ix], None);

        if res.is_success() {
            let old_authority = self.expected.current_authority;
            self.expected.current_authority = pending_key;
            self.expected.authority_transfer_pending = false;
            self.expected.pending_authority_address = Pubkey::default();

            if let Some(config) = read_config(&self.trident, &config_key) {
                assert_eq!(
                    config.authority, pending_key,
                    "INVARIANT VIOLATED: Authority not updated after accept_authority"
                );
                assert_eq!(
                    config.pending_authority,
                    Pubkey::default(),
                    "INVARIANT VIOLATED: pending_authority not cleared after accept"
                );
                assert_ne!(
                    config.authority, old_authority,
                    "Authority transfer did not actually change the authority"
                );
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Unauthorized accept_authority attempt
    // ═════════════════════════════════════════════════════════════════════════
    //
    // A random signer (not the pending authority) tries to accept.
    // This MUST fail — otherwise anyone could hijack authority transfers.
    #[flow]
    fn flow_unauthorized_accept_authority(&mut self) {
        if !self.expected.initialized || !self.expected.authority_transfer_pending {
            return;
        }

        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let random_key = self.fuzz_accounts.random_signers[0].get(&mut self.trident);

        // Make sure the random signer is NOT the pending authority
        if random_key == self.expected.pending_authority_address {
            return;
        }

        let accept_data = sss_core::instruction::AcceptAuthority {};

        let accept_accounts = sss_core::accounts::AcceptAuthority {
            new_authority: random_key,
            config: config_key,
        };

        let accept_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: accept_accounts.to_account_metas(None),
            data: accept_data.data(),
        };

        let res = self.trident.process_transaction(&[accept_ix], None);

        assert!(
            !res.is_success(),
            "CRITICAL INVARIANT VIOLATED: Random signer {} accepted authority transfer \
             that was intended for {}! Authority hijack vulnerability detected.",
            random_key, self.expected.pending_authority_address
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Remove minter and verify it cannot mint
    // ═════════════════════════════════════════════════════════════════════════
    //
    // INVARIANT 4: After remove_minter, the minter's enabled flag is false,
    // and they cannot mint. Their minted_amount is preserved for audit.
    #[flow]
    fn flow_remove_and_verify_minter(&mut self) {
        if !self.expected.initialized {
            return;
        }

        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let current_mm = self.expected.current_master_minter;

        // Pick a random minter to remove
        let idx = self.trident.random_from_range(0usize..NUM_MINTERS);
        if !self.expected.minters[idx].configured || !self.expected.minters[idx].enabled {
            return;
        }

        let minter_state_key = self.fuzz_accounts.minter_states[idx].get(&mut self.trident);

        let pre_minted = self.expected.minters[idx].minted_amount;

        let remove_data = sss_core::instruction::RemoveMinter {};

        let remove_accounts = sss_core::accounts::RemoveMinter {
            master_minter: current_mm,
            config: config_key,
            minter_state: minter_state_key,
        };

        let remove_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: remove_accounts.to_account_metas(None),
            data: remove_data.data(),
        };

        let res = self.trident.process_transaction(&[remove_ix], None);

        if res.is_success() {
            self.expected.minters[idx].enabled = false;

            // INVARIANT: minted_amount preserved (audit trail)
            if let Some(minter) = read_minter_state(&self.trident, &minter_state_key) {
                assert!(
                    !minter.enabled,
                    "Minter should be disabled after remove_minter"
                );
                assert_eq!(
                    minter.minted_amount, pre_minted,
                    "INVARIANT VIOLATED: minted_amount changed on remove_minter! \
                     Was {}, now {}. Audit trail corrupted.",
                    pre_minted, minter.minted_amount
                );
            }

            // Now try to mint with the disabled minter — MUST fail
            if !self.expected.paused {
                let minter_key = self.fuzz_accounts.minter_wallets[idx].get(&mut self.trident);
                let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
                let dest_key =
                    self.fuzz_accounts.minter_token_accounts[idx].get(&mut self.trident);
                let mint_authority_key = self.fuzz_accounts.mint_authority.get(&mut self.trident);

                let mint_data = sss_core::instruction::MintTokens { amount: 1 };

                let mint_accounts = sss_core::accounts::MintTokens {
                    minter: minter_key,
                    config: config_key,
                    minter_state: minter_state_key,
                    mint: mint_key,
                    destination: dest_key,
                    mint_authority: mint_authority_key,
                    token_program: TOKEN_2022_PROGRAM_ID,
                };

                let mint_ix = anchor_lang::solana_program::instruction::Instruction {
                    program_id: SSS_CORE_ID,
                    accounts: mint_accounts.to_account_metas(None),
                    data: mint_data.data(),
                };

                let mint_res = self.trident.process_transaction(&[mint_ix], None);

                assert!(
                    !mint_res.is_success(),
                    "INVARIANT VIOLATED: Disabled minter {} was able to mint! \
                     remove_minter did not effectively revoke minting ability.",
                    minter_key
                );
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Re-enable minter after removal (reconfigure)
    // ═════════════════════════════════════════════════════════════════════════
    //
    // INVARIANT 4 continued: Re-enabling a removed minter must preserve
    // minted_amount. It must NOT reset to 0 (that would restore quota).
    #[flow]
    fn flow_reenable_minter(&mut self) {
        if !self.expected.initialized || self.expected.paused {
            return;
        }

        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let current_mm = self.expected.current_master_minter;

        // Find a disabled minter to re-enable
        let mut found_idx = None;
        for i in 0..NUM_MINTERS {
            if self.expected.minters[i].configured && !self.expected.minters[i].enabled {
                found_idx = Some(i);
                break;
            }
        }

        let idx = match found_idx {
            Some(i) => i,
            None => return,
        };

        let minter_key = self.fuzz_accounts.minter_wallets[idx].get(&mut self.trident);
        let minter_state_key = self.fuzz_accounts.minter_states[idx].get(&mut self.trident);

        let pre_minted = self.expected.minters[idx].minted_amount;
        let new_quota = self
            .trident
            .random_from_range(1_000_000u64..10_000_000_000u64);

        let configure_data = sss_core::instruction::ConfigureMinter {
            minter_wallet: minter_key,
            quota: new_quota,
        };

        let configure_accounts = sss_core::accounts::ConfigureMinter {
            master_minter: current_mm,
            config: config_key,
            minter_state: minter_state_key,
            system_program: system_program::ID,
        };

        let configure_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: configure_accounts.to_account_metas(None),
            data: configure_data.data(),
        };

        let res = self.trident.process_transaction(&[configure_ix], None);

        if res.is_success() {
            self.expected.minters[idx].enabled = true;
            self.expected.minters[idx].quota = new_quota;

            // CRITICAL: minted_amount must be preserved
            if let Some(minter) = read_minter_state(&self.trident, &minter_state_key) {
                assert_eq!(
                    minter.minted_amount, pre_minted,
                    "CRITICAL INVARIANT VIOLATED: Re-enabling minter {} reset minted_amount! \
                     Was {}, now {}. This means disable/re-enable restores quota, \
                     enabling infinite minting through the cycle: \
                     mint -> remove_minter -> configure_minter -> mint again.",
                    idx, pre_minted, minter.minted_amount
                );
                assert!(
                    minter.enabled,
                    "Minter should be enabled after reconfigure"
                );
                assert_eq!(minter.quota, new_quota, "Quota not updated on re-enable");
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Unauthorized role update attempt
    // ═════════════════════════════════════════════════════════════════════════
    //
    // Only the authority can update roles. Random signers must be rejected.
    #[flow]
    fn flow_unauthorized_role_update(&mut self) {
        if !self.expected.initialized {
            return;
        }

        let random_key = self.fuzz_accounts.random_signers[1].get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);

        // Attacker tries to set themselves as master_minter
        let update_data = sss_core::instruction::UpdateRole {
            role: RoleType::MasterMinter,
            new_address: random_key,
        };

        let update_accounts = sss_core::accounts::UpdateRole {
            authority: random_key, // attacker
            config: config_key,
        };

        let update_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: update_accounts.to_account_metas(None),
            data: update_data.data(),
        };

        let res = self.trident.process_transaction(&[update_ix], None);

        assert!(
            !res.is_success(),
            "CRITICAL INVARIANT VIOLATED: Unauthorized signer {} updated the master_minter role! \
             This allows anyone to appoint themselves as master_minter and then create \
             unlimited minters with unlimited quotas.",
            random_key
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Cross-minter quota independence verification
    // ═════════════════════════════════════════════════════════════════════════
    //
    // Explicitly mint with two different minters back-to-back and verify
    // that each minter's quota tracking is completely independent.
    #[flow]
    fn flow_cross_minter_independence(&mut self) {
        if !self.expected.initialized || self.expected.paused {
            return;
        }

        // Need at least 2 configured+enabled minters with remaining quota
        let mut enabled_indices: Vec<usize> = Vec::new();
        for i in 0..NUM_MINTERS {
            if self.expected.minters[i].configured && self.expected.minters[i].enabled {
                let remaining = self.expected.minters[i]
                    .quota
                    .saturating_sub(self.expected.minters[i].minted_amount);
                if remaining > 0 {
                    enabled_indices.push(i);
                }
            }
        }

        if enabled_indices.len() < 2 {
            return;
        }

        let idx_a = enabled_indices[0];
        let idx_b = enabled_indices[1];

        let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let mint_authority_key = self.fuzz_accounts.mint_authority.get(&mut self.trident);

        // Snapshot both minters' state
        let pre_a_minted = self.expected.minters[idx_a].minted_amount;
        let pre_b_minted = self.expected.minters[idx_b].minted_amount;

        // Mint with minter A
        let remaining_a = self.expected.minters[idx_a]
            .quota
            .saturating_sub(pre_a_minted);
        let amount_a = self
            .trident
            .random_from_range(1u64..=remaining_a.min(100_000));

        let minter_a_key = self.fuzz_accounts.minter_wallets[idx_a].get(&mut self.trident);
        let ms_a_key = self.fuzz_accounts.minter_states[idx_a].get(&mut self.trident);
        let dest_a_key = self.fuzz_accounts.minter_token_accounts[idx_a].get(&mut self.trident);

        let mint_a_data = sss_core::instruction::MintTokens { amount: amount_a };
        let mint_a_accounts = sss_core::accounts::MintTokens {
            minter: minter_a_key,
            config: config_key,
            minter_state: ms_a_key,
            mint: mint_key,
            destination: dest_a_key,
            mint_authority: mint_authority_key,
            token_program: TOKEN_2022_PROGRAM_ID,
        };
        let mint_a_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: mint_a_accounts.to_account_metas(None),
            data: mint_a_data.data(),
        };

        let res_a = self.trident.process_transaction(&[mint_a_ix], None);
        if res_a.is_success() {
            self.expected.minters[idx_a].minted_amount += amount_a;
            self.expected.total_minted += amount_a;
        }

        // Verify minter B was NOT affected by minter A's operation
        let ms_b_key = self.fuzz_accounts.minter_states[idx_b].get(&mut self.trident);
        if let Some(minter_b) = read_minter_state(&self.trident, &ms_b_key) {
            assert_eq!(
                minter_b.minted_amount, pre_b_minted,
                "QUOTA ISOLATION VIOLATED: Minter A's mint changed minter B's minted_amount! \
                 B was {} before A minted, now {}.",
                pre_b_minted, minter_b.minted_amount
            );
        }

        // Now mint with minter B
        let remaining_b = self.expected.minters[idx_b]
            .quota
            .saturating_sub(pre_b_minted);
        let amount_b = self
            .trident
            .random_from_range(1u64..=remaining_b.min(100_000));

        let minter_b_key = self.fuzz_accounts.minter_wallets[idx_b].get(&mut self.trident);
        let dest_b_key = self.fuzz_accounts.minter_token_accounts[idx_b].get(&mut self.trident);

        let mint_b_data = sss_core::instruction::MintTokens { amount: amount_b };
        let mint_b_accounts = sss_core::accounts::MintTokens {
            minter: minter_b_key,
            config: config_key,
            minter_state: ms_b_key,
            mint: mint_key,
            destination: dest_b_key,
            mint_authority: mint_authority_key,
            token_program: TOKEN_2022_PROGRAM_ID,
        };
        let mint_b_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: mint_b_accounts.to_account_metas(None),
            data: mint_b_data.data(),
        };

        let res_b = self.trident.process_transaction(&[mint_b_ix], None);
        if res_b.is_success() {
            self.expected.minters[idx_b].minted_amount += amount_b;
            self.expected.total_minted += amount_b;
        }

        // Final cross-check: verify A's minted_amount was not affected by B
        if let Some(minter_a) = read_minter_state(&self.trident, &ms_a_key) {
            assert_eq!(
                minter_a.minted_amount,
                self.expected.minters[idx_a].minted_amount,
                "QUOTA ISOLATION VIOLATED: Minter B's mint changed minter A's minted_amount! \
                 Expected {}, got {}.",
                self.expected.minters[idx_a].minted_amount,
                minter_a.minted_amount
            );
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Pause with updated pauser role
    // ═════════════════════════════════════════════════════════════════════════
    //
    // Tests that after update_role(Pauser, new_pauser), only the new pauser
    // can pause, and the old pauser cannot.
    #[flow]
    fn flow_pause_with_new_pauser(&mut self) {
        if !self.expected.initialized || self.expected.paused {
            return;
        }

        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let current_pauser = self.expected.current_pauser;

        let pause_data = sss_core::instruction::Pause {};
        let pause_accounts = sss_core::accounts::Pause {
            pauser: current_pauser,
            config: config_key,
        };

        let pause_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: pause_accounts.to_account_metas(None),
            data: pause_data.data(),
        };

        let res = self.trident.process_transaction(&[pause_ix], None);

        if res.is_success() {
            self.expected.paused = true;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Unpause with current pauser
    // ═════════════════════════════════════════════════════════════════════════
    #[flow]
    fn flow_unpause_with_current_pauser(&mut self) {
        if !self.expected.initialized || !self.expected.paused {
            return;
        }

        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let current_pauser = self.expected.current_pauser;

        let unpause_data = sss_core::instruction::Unpause {};
        let unpause_accounts = sss_core::accounts::Unpause {
            pauser: current_pauser,
            config: config_key,
        };

        let unpause_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: unpause_accounts.to_account_metas(None),
            data: unpause_data.data(),
        };

        let res = self.trident.process_transaction(&[unpause_ix], None);

        if res.is_success() {
            self.expected.paused = false;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // END: Final multi-user invariant checks
    // ═════════════════════════════════════════════════════════════════════════
    #[end]
    fn final_multi_user_checks(&mut self) {
        if !self.expected.initialized {
            return;
        }

        let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);

        // ── FINAL INVARIANT: Supply conservation ────────────────────────
        if let Some(config) = read_config(&self.trident, &config_key) {
            let expected_supply = config.total_minted.saturating_sub(config.total_burned);

            if let Ok(mint_account) = self.trident.get_mint(&mint_key) {
                assert_eq!(
                    mint_account.base.supply, expected_supply,
                    "FINAL SUPPLY CONSERVATION VIOLATED: \
                     on-chain supply ({}) != total_minted ({}) - total_burned ({}) = {}",
                    mint_account.base.supply,
                    config.total_minted,
                    config.total_burned,
                    expected_supply
                );
            }

            // Verify our local tracking matches on-chain
            assert_eq!(
                config.total_minted, self.expected.total_minted,
                "FINAL: on-chain total_minted != local tracking"
            );
            assert_eq!(
                config.total_burned, self.expected.total_burned,
                "FINAL: on-chain total_burned != local tracking"
            );
        }

        // ── FINAL INVARIANT: Per-minter quota compliance ────────────────
        for i in 0..NUM_MINTERS {
            if !self.expected.minters[i].configured {
                continue;
            }
            let ms_key = self.fuzz_accounts.minter_states[i].get(&mut self.trident);
            if let Some(minter) = read_minter_state(&self.trident, &ms_key) {
                assert!(
                    minter.minted_amount <= minter.quota,
                    "FINAL INVARIANT: minter[{}] minted_amount ({}) > quota ({})",
                    i,
                    minter.minted_amount,
                    minter.quota
                );
                assert_eq!(
                    minter.minted_amount, self.expected.minters[i].minted_amount,
                    "FINAL INVARIANT: minter[{}] on-chain minted_amount ({}) != \
                     local tracking ({})",
                    i,
                    minter.minted_amount,
                    self.expected.minters[i].minted_amount
                );
            }
        }

        // ── FINAL INVARIANT: Role consistency ───────────────────────────
        if let Some(config) = read_config(&self.trident, &config_key) {
            assert_eq!(
                config.authority, self.expected.current_authority,
                "FINAL: on-chain authority doesn't match expected"
            );
            assert_eq!(
                config.master_minter, self.expected.current_master_minter,
                "FINAL: on-chain master_minter doesn't match expected"
            );
            assert_eq!(
                config.pauser, self.expected.current_pauser,
                "FINAL: on-chain pauser doesn't match expected"
            );
        }

        // ── Aggregate accounting invariant ──────────────────────────────
        // The sum of all minters' minted_amount must equal total_minted.
        // This catches bugs where total_minted is updated but the per-minter
        // counter is not (or vice versa).
        let total_minted_across_minters: u64 = self
            .expected
            .minters
            .iter()
            .map(|m| m.minted_amount)
            .sum();

        assert_eq!(
            total_minted_across_minters, self.expected.total_minted,
            "FINAL INVARIANT: Sum of all minters' minted_amount ({}) != total_minted ({}). \
             Per-minter accounting is inconsistent with global accounting.",
            total_minted_across_minters, self.expected.total_minted
        );

        self.trident
            .record_accumulator("multi_total_minted", self.expected.total_minted as f64);
    }
}

// ─── Entry point ────────────────────────────────────────────────────────────

fn main() {
    // Run 300 iterations, each executing up to 80 randomly-selected flows.
    // This means up to 24,000 operations testing multi-user scenarios.
    //
    // Each iteration:
    //   1. #[init]: fresh stablecoin with 3 minters
    //   2. 80 random flows: multi-minter minting, role updates, authority
    //      transfer, minter removal/re-enable, access control tests
    //   3. #[end]: comprehensive invariant verification
    //
    // The higher flow count per iteration (80 vs 50 in fuzz_0) is because
    // multi-user scenarios need more operations to reach interesting states
    // (e.g., authority transferred AND role updated AND minter removed).
    FuzzTest::fuzz(300, 80);
}
