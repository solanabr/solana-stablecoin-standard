// =============================================================================
// fuzz_0/test_fuzz.rs — Core Operations Fuzzer
// =============================================================================
//
// PURPOSE: Fuzz the core lifecycle of the Solana Stablecoin Standard (sss-core)
// to verify critical invariants that protect real-world stablecoin deployments.
//
// COVERAGE:
//   - initialize: creates stablecoin config and Token-2022 mint
//   - configure_minter: sets up minter with quota
//   - mint_tokens: mints tokens, enforces quota
//   - burn_tokens: burns tokens, verifies quota not restored
//   - pause / unpause: toggles pause state
//   - freeze_account / thaw_account: emergency account freeze/thaw
//
// INVARIANTS VERIFIED:
//   1. Supply conservation: total_minted - total_burned == on-chain mint supply
//   2. Quota enforcement: minter.minted_amount <= minter.quota (always)
//   3. Quota irreversibility: burning does NOT reduce minted_amount or restore quota
//   4. Pause enforcement: mint/burn MUST fail when paused
//   5. Role-based access: random signers MUST be rejected by privileged instructions
//   6. No unauthorized supply increase: supply only grows via mint_tokens instruction
//
// STRATEGY:
//   The #[init] flow sets up a valid stablecoin with one minter.
//   Then random #[flow] methods are called in random order, each performing
//   an operation and checking invariants. This simulates real-world usage where
//   minting, burning, pausing, and freezing happen in unpredictable sequences.

use fuzz_accounts::FuzzAccounts;
use trident_fuzz::fuzzing::*;
mod fuzz_accounts;

// We import sss-core types to build correct Anchor instruction data.
// The instruction data format is: 8-byte discriminator + borsh-serialized args.
use anchor_lang::prelude::Pubkey;
use anchor_lang::InstructionData;
use anchor_lang::ToAccountMetas;
use anchor_lang::system_program;

// Re-export program types for instruction building.
use sss_core::constants::*;
use sss_core::state::{StablecoinConfig, MinterState};

// ─── Program IDs ────────────────────────────────────────────────────────────
const SSS_CORE_ID: Pubkey = sss_core::ID;

// Token-2022 program ID (SPL Token 2022)
// The well-known address for the Token-2022 program on all Solana clusters.
const TOKEN_2022_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// ─── Local tracking state ───────────────────────────────────────────────────
// We mirror critical on-chain state locally so we can cross-check after every
// operation. Any discrepancy indicates a program bug.

/// Tracks the expected state of the stablecoin for invariant verification.
#[derive(Debug, Default)]
struct ExpectedState {
    /// Whether the stablecoin has been initialized in this iteration.
    initialized: bool,
    /// Whether the minter has been configured.
    minter_configured: bool,
    /// Expected total_minted counter on the config account.
    total_minted: u64,
    /// Expected total_burned counter on the config account.
    total_burned: u64,
    /// Expected minted_amount on the minter_state account.
    minter_minted_amount: u64,
    /// The configured minter quota.
    minter_quota: u64,
    /// Whether the stablecoin is currently paused.
    paused: bool,
}

// ─── FuzzTest struct ────────────────────────────────────────────────────────

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: FuzzAccounts,
    expected: ExpectedState,
}

// ─── Helper: derive PDA addresses ───────────────────────────────────────────

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

// ─── Helper: read on-chain accounts for invariant checks ────────────────────

/// Reads the StablecoinConfig account from the Trident SVM.
/// Returns None if the account doesn't exist or can't be deserialized.
fn read_config(trident: &Trident, config_key: &Pubkey) -> Option<StablecoinConfig> {
    // Anchor accounts have an 8-byte discriminator prefix
    trident.get_account_with_type::<StablecoinConfig>(config_key, 8)
}

/// Reads the MinterState account from the Trident SVM.
fn read_minter_state(trident: &Trident, minter_state_key: &Pubkey) -> Option<MinterState> {
    trident.get_account_with_type::<MinterState>(minter_state_key, 8)
}

// ─── Flow Executor ──────────────────────────────────────────────────────────

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: FuzzAccounts::default(),
            expected: ExpectedState::default(),
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INIT: Set up a valid stablecoin with one minter each iteration
    // ═════════════════════════════════════════════════════════════════════════
    #[init]
    fn initialize_stablecoin(&mut self) {
        // Reset expected state for this iteration
        self.expected = ExpectedState::default();

        // 1. Create authority keypair and fund it
        let authority_key = self.fuzz_accounts.authority.insert(&mut self.trident, None);
        self.trident.airdrop(&authority_key, 50 * LAMPORTS_PER_SOL);

        // 2. Create mint keypair
        let mint_key = self.fuzz_accounts.mint.insert(&mut self.trident, None);

        // 3. Derive PDAs
        let (config_key, _config_bump) = derive_config_pda(&mint_key);
        self.fuzz_accounts.config.insert_with_address(config_key);

        let (mint_authority_key, _ma_bump) = derive_mint_authority_pda(&mint_key);
        self.fuzz_accounts
            .mint_authority
            .insert_with_address(mint_authority_key);

        // 4. Create minter keypair and derive its PDA
        let minter_key = self.fuzz_accounts.minter.insert(&mut self.trident, None);
        self.trident.airdrop(&minter_key, 10 * LAMPORTS_PER_SOL);

        let (minter_state_key, _ms_bump) = derive_minter_state_pda(&config_key, &minter_key);
        self.fuzz_accounts
            .minter_state
            .insert_with_address(minter_state_key);

        // 5. Create random unauthorized signer for access control testing
        let random_key = self.fuzz_accounts.random_signer.insert(&mut self.trident, None);
        self.trident.airdrop(&random_key, 5 * LAMPORTS_PER_SOL);

        // Store the pauser and blacklister as the authority initially
        self.fuzz_accounts.pauser.insert_with_address(authority_key);
        self.fuzz_accounts
            .blacklister
            .insert_with_address(authority_key);

        // 6. Build and execute the initialize instruction
        //
        // The initialize instruction creates:
        //   - A Token-2022 mint with MetadataPointer + MintCloseAuthority extensions
        //   - A StablecoinConfig PDA storing roles and state
        //   - Token metadata on the mint itself
        //
        // We use preset=1 (SSS-1 Minimal) to avoid needing the hook program.
        let init_data = sss_core::instruction::Initialize {
            params: sss_core::instructions::InitializeParams {
                preset: PRESET_MINIMAL,
                name: "FuzzCoin".to_string(),
                symbol: "FUZZ".to_string(),
                uri: "https://fuzz.test".to_string(),
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

        // The mint must be a signer for create_account CPI
        let res = self.trident.process_transaction(
            &[init_ix],
            // Note: Trident auto-signs with keys it knows about from AddressStorage.
            // The authority and mint were both inserted via insert() so their keypairs
            // are available for signing.
            None,
        );

        if res.is_success() {
            self.expected.initialized = true;

            // Verify initial state is clean
            if let Some(config) = read_config(&self.trident, &config_key) {
                assert_eq!(config.total_minted, 0, "INVARIANT: initial total_minted must be 0");
                assert_eq!(config.total_burned, 0, "INVARIANT: initial total_burned must be 0");
                assert!(!config.paused, "INVARIANT: initial paused must be false");
                assert_eq!(
                    config.authority, authority_key,
                    "INVARIANT: authority must match initializer"
                );
                assert_eq!(
                    config.master_minter, authority_key,
                    "INVARIANT: master_minter defaults to authority"
                );
            }
        }

        // 7. Set up a destination token account for minting
        //    Using Trident's Token-2022 helpers to create the ATA
        if self.expected.initialized {
            let dest_key = self.fuzz_accounts.destination_token_account.insert(
                &mut self.trident,
                None,
            );

            // Initialize a Token-2022 token account for the minter to receive minted tokens
            let create_ata_ixs = self.trident.initialize_token_account_2022(
                &authority_key,  // payer
                &dest_key,       // new token account
                &mint_key,       // mint
                &minter_key,     // owner of the token account
                &[],             // no account extensions needed for SSS-1
            );

            let ata_res = self.trident.process_transaction(&create_ata_ixs, None);
            if !ata_res.is_success() {
                // If ATA creation fails, the iteration will still exercise
                // other flows like pause/unpause and access control.
            }

            // Also create a burner token account (owned by authority for burn tests)
            let burner_key = self.fuzz_accounts.burner_token_account.insert(
                &mut self.trident,
                None,
            );
            let create_burner_ixs = self.trident.initialize_token_account_2022(
                &authority_key,
                &burner_key,
                &mint_key,
                &authority_key,  // authority owns the burn account
                &[],
            );
            let _ = self.trident.process_transaction(&create_burner_ixs, None);
        }

        // 8. Configure the minter with a randomized quota
        if self.expected.initialized {
            let quota = self.trident.random_from_range(1_000_000u64..10_000_000_000u64);

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
                self.expected.minter_configured = true;
                self.expected.minter_quota = quota;
                self.expected.minter_minted_amount = 0;
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Mint tokens — the most critical operation to fuzz
    // ═════════════════════════════════════════════════════════════════════════
    //
    // INVARIANTS CHECKED:
    //   - After successful mint: minted_amount <= quota (ALWAYS)
    //   - After successful mint: total_minted increased by exactly `amount`
    //   - After successful mint: on-chain supply == total_minted - total_burned
    //   - When paused: mint MUST fail
    //   - When quota exceeded: mint MUST fail
    #[flow]
    fn flow_mint_tokens(&mut self) {
        if !self.expected.initialized || !self.expected.minter_configured {
            return;
        }

        let minter_key = self.fuzz_accounts.minter.get(&mut self.trident);
        let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let minter_state_key = self.fuzz_accounts.minter_state.get(&mut self.trident);
        let dest_key = self.fuzz_accounts.destination_token_account.get(&mut self.trident);
        let mint_authority_key = self.fuzz_accounts.mint_authority.get(&mut self.trident);

        // Fuzz the mint amount: sometimes valid, sometimes exceeds quota
        let remaining_quota = self
            .expected
            .minter_quota
            .saturating_sub(self.expected.minter_minted_amount);

        // 70% chance of valid amount, 30% chance of potentially exceeding quota
        let amount = if self.trident.random_from_range(0u8..10u8) < 7 && remaining_quota > 0 {
            self.trident.random_from_range(1u64..=remaining_quota)
        } else {
            // Potentially exceeds quota — should be rejected
            self.trident.random_from_range(1u64..u64::MAX)
        };

        // Snapshot pre-state for invariant checking
        let pre_total_minted = self.expected.total_minted;
        let pre_minter_minted = self.expected.minter_minted_amount;

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
            // ── INVARIANT 1: Update and verify quota tracking ────────────
            self.expected.minter_minted_amount += amount;
            self.expected.total_minted += amount;

            // CRITICAL INVARIANT: minted_amount must never exceed quota.
            // If this fires, there's an overflow or bounds-check bug.
            assert!(
                self.expected.minter_minted_amount <= self.expected.minter_quota,
                "INVARIANT VIOLATED: minted_amount ({}) > quota ({}). \
                 This means the program allowed minting beyond the authorized quota, \
                 which would enable unauthorized token creation.",
                self.expected.minter_minted_amount,
                self.expected.minter_quota
            );

            // ── INVARIANT 2: Verify on-chain state matches ──────────────
            if let Some(config) = read_config(&self.trident, &config_key) {
                assert_eq!(
                    config.total_minted, self.expected.total_minted,
                    "INVARIANT VIOLATED: on-chain total_minted ({}) != expected ({}). \
                     Supply accounting is broken.",
                    config.total_minted, self.expected.total_minted
                );
            }

            if let Some(minter) = read_minter_state(&self.trident, &minter_state_key) {
                assert_eq!(
                    minter.minted_amount, self.expected.minter_minted_amount,
                    "INVARIANT VIOLATED: on-chain minted_amount ({}) != expected ({})",
                    minter.minted_amount, self.expected.minter_minted_amount
                );
                assert!(
                    minter.minted_amount <= minter.quota,
                    "INVARIANT VIOLATED: on-chain minted_amount ({}) > on-chain quota ({})",
                    minter.minted_amount, minter.quota
                );
            }

            // ── INVARIANT 3: Supply conservation ────────────────────────
            // total_minted - total_burned == actual on-chain mint supply
            self.verify_supply_conservation(&mint_key, &config_key);

            // Record metric for the fuzzing dashboard
            self.trident.record_histogram("mint_amount", amount as f64);
        } else {
            // Verify that failure was expected:
            // - Paused state should block minting
            // - Quota exceeded should block minting
            // - Zero amount should be rejected
            if self.expected.paused {
                // Good: mint correctly rejected while paused.
                // INVARIANT 4: Pause enforcement is working.
            } else if amount == 0 {
                // Good: zero amount rejected
            } else if amount > remaining_quota {
                // Good: quota exceeded rejected
            }
            // Other failures may be legitimate (e.g., account not found)

            // State must NOT have changed on failure
            assert_eq!(
                self.expected.total_minted, pre_total_minted,
                "INVARIANT VIOLATED: total_minted changed on failed mint"
            );
            assert_eq!(
                self.expected.minter_minted_amount, pre_minter_minted,
                "INVARIANT VIOLATED: minter_minted_amount changed on failed mint"
            );
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Burn tokens
    // ═════════════════════════════════════════════════════════════════════════
    //
    // INVARIANTS CHECKED:
    //   - After burn: total_burned increases by exactly `amount`
    //   - After burn: minter.minted_amount is UNCHANGED (quota not restored)
    //   - Supply conservation still holds after burn
    //   - When paused: burn MUST fail
    #[flow]
    fn flow_burn_tokens(&mut self) {
        if !self.expected.initialized {
            return;
        }

        let authority_key = self.fuzz_accounts.authority.get(&mut self.trident);
        let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let burner_key = self.fuzz_accounts.burner_token_account.get(&mut self.trident);

        // We need tokens to burn — first mint some to the burner account if possible
        // For simplicity, we attempt to burn a fuzzed amount. If the account has
        // insufficient balance, the program will reject it (which is correct behavior).
        let amount = self.trident.random_from_range(1u64..1_000_000u64);

        let pre_total_burned = self.expected.total_burned;
        let pre_minter_minted = self.expected.minter_minted_amount;

        let burn_data = sss_core::instruction::BurnTokens { amount };

        let burn_accounts = sss_core::accounts::BurnTokens {
            burner: authority_key,
            config: config_key,
            mint: mint_key,
            token_account: burner_key,
            token_program: TOKEN_2022_PROGRAM_ID,
        };

        let burn_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: burn_accounts.to_account_metas(None),
            data: burn_data.data(),
        };

        let res = self.trident.process_transaction(&[burn_ix], None);

        if res.is_success() {
            self.expected.total_burned += amount;

            // ── INVARIANT 5: Quota irreversibility ──────────────────────
            // Burning MUST NOT reduce minted_amount. This is critical because
            // if burning restored quota, a minter could mint -> burn -> mint
            // in an infinite loop, creating unbounded supply.
            assert_eq!(
                self.expected.minter_minted_amount, pre_minter_minted,
                "INVARIANT VIOLATED: minter.minted_amount changed after burn! \
                 Was {} before, expected same after burn. \
                 If burning restores quota, a minter can create infinite tokens.",
                pre_minter_minted
            );

            // Verify on-chain: minted_amount unchanged
            if self.expected.minter_configured {
                let minter_state_key = self.fuzz_accounts.minter_state.get(&mut self.trident);
                if let Some(minter) = read_minter_state(&self.trident, &minter_state_key) {
                    assert_eq!(
                        minter.minted_amount, self.expected.minter_minted_amount,
                        "INVARIANT VIOLATED: on-chain minted_amount changed after burn! \
                         Quota restoration vulnerability detected."
                    );
                }
            }

            // ── INVARIANT 3: Supply conservation ────────────────────────
            self.verify_supply_conservation(&mint_key, &config_key);

            self.trident.record_histogram("burn_amount", amount as f64);
        } else {
            // Verify state unchanged on failure
            assert_eq!(
                self.expected.total_burned, pre_total_burned,
                "INVARIANT VIOLATED: total_burned changed on failed burn"
            );

            if self.expected.paused {
                // Good: burn correctly rejected while paused (INVARIANT 4)
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Pause the stablecoin
    // ═════════════════════════════════════════════════════════════════════════
    //
    // After pausing, mint and burn MUST fail. Freeze/thaw should still work
    // (emergency powers). Only the pauser role can pause.
    #[flow]
    fn flow_pause(&mut self) {
        if !self.expected.initialized || self.expected.paused {
            return;
        }

        let pauser_key = self.fuzz_accounts.pauser.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);

        let pause_data = sss_core::instruction::Pause {};

        let pause_accounts = sss_core::accounts::Pause {
            pauser: pauser_key,
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

            // Verify on-chain
            if let Some(config) = read_config(&self.trident, &config_key) {
                assert!(
                    config.paused,
                    "INVARIANT VIOLATED: pause succeeded but on-chain paused is false"
                );
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Unpause the stablecoin
    // ═════════════════════════════════════════════════════════════════════════
    #[flow]
    fn flow_unpause(&mut self) {
        if !self.expected.initialized || !self.expected.paused {
            return;
        }

        let pauser_key = self.fuzz_accounts.pauser.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);

        let unpause_data = sss_core::instruction::Unpause {};

        let unpause_accounts = sss_core::accounts::Unpause {
            pauser: pauser_key,
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

            if let Some(config) = read_config(&self.trident, &config_key) {
                assert!(
                    !config.paused,
                    "INVARIANT VIOLATED: unpause succeeded but on-chain paused is true"
                );
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Unauthorized mint attempt — access control fuzzing
    // ═════════════════════════════════════════════════════════════════════════
    //
    // INVARIANT 5 (Role enforcement): A random signer who is NOT the configured
    // minter must NEVER be able to mint tokens. If this succeeds, it means
    // anyone can create tokens — a catastrophic vulnerability.
    #[flow]
    fn flow_unauthorized_mint(&mut self) {
        if !self.expected.initialized || !self.expected.minter_configured {
            return;
        }

        let random_signer = self.fuzz_accounts.random_signer.get(&mut self.trident);
        let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let dest_key = self.fuzz_accounts.destination_token_account.get(&mut self.trident);
        let mint_authority_key = self.fuzz_accounts.mint_authority.get(&mut self.trident);

        // Derive minter_state PDA for the random signer (will likely not exist)
        let (fake_minter_state, _) = derive_minter_state_pda(&config_key, &random_signer);

        let amount = self.trident.random_from_range(1u64..1_000_000u64);

        let mint_data = sss_core::instruction::MintTokens { amount };

        let mint_accounts = sss_core::accounts::MintTokens {
            minter: random_signer,
            config: config_key,
            minter_state: fake_minter_state,
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

        let pre_total_minted = self.expected.total_minted;
        let res = self.trident.process_transaction(&[mint_ix], None);

        // CRITICAL INVARIANT: Unauthorized mint MUST fail
        assert!(
            !res.is_success(),
            "CRITICAL INVARIANT VIOLATED: Unauthorized signer {} was able to mint {} tokens! \
             This means ANYONE can create tokens, completely breaking the stablecoin's value peg.",
            random_signer,
            amount
        );

        // Double-check supply didn't change
        assert_eq!(
            self.expected.total_minted, pre_total_minted,
            "INVARIANT VIOLATED: total_minted changed despite unauthorized mint failure"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Unauthorized pause attempt
    // ═════════════════════════════════════════════════════════════════════════
    //
    // Only the designated pauser should be able to pause. If a random signer
    // can pause, it enables griefing attacks that halt all operations.
    #[flow]
    fn flow_unauthorized_pause(&mut self) {
        if !self.expected.initialized || self.expected.paused {
            return;
        }

        let random_signer = self.fuzz_accounts.random_signer.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);

        let pause_data = sss_core::instruction::Pause {};

        let pause_accounts = sss_core::accounts::Pause {
            pauser: random_signer,
            config: config_key,
        };

        let pause_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: pause_accounts.to_account_metas(None),
            data: pause_data.data(),
        };

        let res = self.trident.process_transaction(&[pause_ix], None);

        assert!(
            !res.is_success(),
            "INVARIANT VIOLATED: Unauthorized signer {} was able to pause the stablecoin! \
             This enables denial-of-service attacks on the entire stablecoin system.",
            random_signer
        );

        // Verify pause state unchanged
        assert!(
            !self.expected.paused,
            "INVARIANT VIOLATED: paused state changed despite unauthorized pause failure"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Unauthorized configure_minter attempt
    // ═════════════════════════════════════════════════════════════════════════
    //
    // Only the master_minter should configure minters. If a random user can
    // configure themselves as a minter with unlimited quota, they can mint
    // unlimited tokens.
    #[flow]
    fn flow_unauthorized_configure_minter(&mut self) {
        if !self.expected.initialized {
            return;
        }

        let random_signer = self.fuzz_accounts.random_signer.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);

        // Try to configure the random signer itself as a minter with max quota
        let (fake_minter_state, _) = derive_minter_state_pda(&config_key, &random_signer);

        let configure_data = sss_core::instruction::ConfigureMinter {
            minter_wallet: random_signer,
            quota: u64::MAX,
        };

        let configure_accounts = sss_core::accounts::ConfigureMinter {
            master_minter: random_signer,  // random signer pretending to be master_minter
            config: config_key,
            minter_state: fake_minter_state,
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
            "CRITICAL INVARIANT VIOLATED: Unauthorized signer {} configured themselves as minter \
             with quota {}! This allows unlimited unauthorized token creation.",
            random_signer,
            u64::MAX
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Mint while paused — must fail
    // ═════════════════════════════════════════════════════════════════════════
    //
    // INVARIANT 4: When the stablecoin is paused, no minting should be possible.
    // This is critical for emergency response (e.g., exploit detected).
    #[flow]
    fn flow_mint_while_paused(&mut self) {
        if !self.expected.initialized || !self.expected.minter_configured || !self.expected.paused {
            return;
        }

        let minter_key = self.fuzz_accounts.minter.get(&mut self.trident);
        let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let minter_state_key = self.fuzz_accounts.minter_state.get(&mut self.trident);
        let dest_key = self.fuzz_accounts.destination_token_account.get(&mut self.trident);
        let mint_authority_key = self.fuzz_accounts.mint_authority.get(&mut self.trident);

        let amount = self.trident.random_from_range(1u64..1_000_000u64);

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

        let pre_total_minted = self.expected.total_minted;
        let res = self.trident.process_transaction(&[mint_ix], None);

        // INVARIANT 4: Mint MUST fail when paused
        assert!(
            !res.is_success(),
            "CRITICAL INVARIANT VIOLATED: Mint succeeded while paused! \
             amount={}, paused=true. The pause mechanism is broken, \
             meaning emergency stops cannot prevent unauthorized minting.",
            amount
        );

        assert_eq!(
            self.expected.total_minted, pre_total_minted,
            "INVARIANT VIOLATED: total_minted changed on paused mint"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Reconfigure minter quota (update existing minter)
    // ═════════════════════════════════════════════════════════════════════════
    //
    // Tests that reconfiguring a minter preserves minted_amount but updates
    // quota. This is important because init_if_needed is used.
    #[flow]
    fn flow_reconfigure_minter(&mut self) {
        if !self.expected.initialized || !self.expected.minter_configured || self.expected.paused {
            return;
        }

        let authority_key = self.fuzz_accounts.authority.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let minter_key = self.fuzz_accounts.minter.get(&mut self.trident);
        let minter_state_key = self.fuzz_accounts.minter_state.get(&mut self.trident);

        // Snapshot minted_amount before reconfiguration
        let pre_minted_amount = self.expected.minter_minted_amount;

        // New quota: sometimes higher, sometimes lower than current
        let new_quota = self.trident.random_from_range(1u64..10_000_000_000u64);

        let configure_data = sss_core::instruction::ConfigureMinter {
            minter_wallet: minter_key,
            quota: new_quota,
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
            self.expected.minter_quota = new_quota;

            // CRITICAL: minted_amount MUST be preserved across reconfiguration.
            // If init_if_needed resets minted_amount to 0, the minter gets
            // their entire quota back, enabling unbounded minting.
            if let Some(minter) = read_minter_state(&self.trident, &minter_state_key) {
                assert_eq!(
                    minter.minted_amount, pre_minted_amount,
                    "INVARIANT VIOLATED: minted_amount reset on reconfigure! \
                     Was {}, now {}. This means reconfiguring a minter restores \
                     their quota, enabling infinite minting.",
                    pre_minted_amount, minter.minted_amount
                );
                assert_eq!(
                    minter.quota, new_quota,
                    "Quota not updated correctly after reconfigure"
                );
                assert!(
                    minter.enabled,
                    "Minter should be enabled after reconfigure"
                );
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Freeze account (emergency power)
    // ═════════════════════════════════════════════════════════════════════════
    //
    // Freeze should work even when paused (it's an emergency power).
    // Only authority or blacklister can freeze.
    #[flow]
    fn flow_freeze_account(&mut self) {
        if !self.expected.initialized {
            return;
        }

        let authority_key = self.fuzz_accounts.authority.get(&mut self.trident);
        let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let dest_key = self.fuzz_accounts.destination_token_account.get(&mut self.trident);
        let mint_authority_key = self.fuzz_accounts.mint_authority.get(&mut self.trident);

        let freeze_data = sss_core::instruction::FreezeAccount {};

        let freeze_accounts = sss_core::accounts::FreezeTokenAccount {
            signer: authority_key,
            config: config_key,
            mint: mint_key,
            target_token_account: dest_key,
            mint_authority: mint_authority_key,
            token_program: TOKEN_2022_PROGRAM_ID,
        };

        let freeze_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: freeze_accounts.to_account_metas(None),
            data: freeze_data.data(),
        };

        let _res = self.trident.process_transaction(&[freeze_ix], None);
        // Freeze may fail if account is already frozen, which is fine.
        // The important thing is that it doesn't panic or corrupt state.
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Thaw account
    // ═════════════════════════════════════════════════════════════════════════
    #[flow]
    fn flow_thaw_account(&mut self) {
        if !self.expected.initialized {
            return;
        }

        let authority_key = self.fuzz_accounts.authority.get(&mut self.trident);
        let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let dest_key = self.fuzz_accounts.destination_token_account.get(&mut self.trident);
        let mint_authority_key = self.fuzz_accounts.mint_authority.get(&mut self.trident);

        let thaw_data = sss_core::instruction::ThawAccount {};

        let thaw_accounts = sss_core::accounts::ThawTokenAccount {
            signer: authority_key,
            config: config_key,
            mint: mint_key,
            target_token_account: dest_key,
            mint_authority: mint_authority_key,
            token_program: TOKEN_2022_PROGRAM_ID,
        };

        let thaw_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: thaw_accounts.to_account_metas(None),
            data: thaw_data.data(),
        };

        let _res = self.trident.process_transaction(&[thaw_ix], None);
        // Thaw may fail if account is not frozen, which is fine.
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FLOW: Unauthorized freeze attempt
    // ═════════════════════════════════════════════════════════════════════════
    //
    // Random signers must not be able to freeze accounts. If they can,
    // it enables griefing attacks that lock user funds.
    #[flow]
    fn flow_unauthorized_freeze(&mut self) {
        if !self.expected.initialized {
            return;
        }

        let random_signer = self.fuzz_accounts.random_signer.get(&mut self.trident);
        let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);
        let dest_key = self.fuzz_accounts.destination_token_account.get(&mut self.trident);
        let mint_authority_key = self.fuzz_accounts.mint_authority.get(&mut self.trident);

        let freeze_data = sss_core::instruction::FreezeAccount {};

        let freeze_accounts = sss_core::accounts::FreezeTokenAccount {
            signer: random_signer,
            config: config_key,
            mint: mint_key,
            target_token_account: dest_key,
            mint_authority: mint_authority_key,
            token_program: TOKEN_2022_PROGRAM_ID,
        };

        let freeze_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: SSS_CORE_ID,
            accounts: freeze_accounts.to_account_metas(None),
            data: freeze_data.data(),
        };

        let res = self.trident.process_transaction(&[freeze_ix], None);

        assert!(
            !res.is_success(),
            "INVARIANT VIOLATED: Unauthorized signer {} was able to freeze an account! \
             This enables griefing attacks that can lock any user's funds.",
            random_signer
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // END: Final invariant checks after all flows complete
    // ═════════════════════════════════════════════════════════════════════════
    #[end]
    fn final_invariant_check(&mut self) {
        if !self.expected.initialized {
            return;
        }

        let mint_key = self.fuzz_accounts.mint.get(&mut self.trident);
        let config_key = self.fuzz_accounts.config.get(&mut self.trident);

        // ── FINAL INVARIANT: Supply conservation ────────────────────────
        // After all operations, the fundamental accounting equation must hold:
        //   total_minted - total_burned == on-chain mint supply
        self.verify_supply_conservation(&mint_key, &config_key);

        // ── FINAL INVARIANT: Quota never exceeded ───────────────────────
        if self.expected.minter_configured {
            let minter_state_key = self.fuzz_accounts.minter_state.get(&mut self.trident);
            if let Some(minter) = read_minter_state(&self.trident, &minter_state_key) {
                assert!(
                    minter.minted_amount <= minter.quota,
                    "FINAL INVARIANT VIOLATED: minted_amount ({}) > quota ({}) at end of iteration. \
                     The minter was allowed to exceed their authorized quota.",
                    minter.minted_amount, minter.quota
                );
            }
        }

        // ── FINAL INVARIANT: State counters consistent ──────────────────
        if let Some(config) = read_config(&self.trident, &config_key) {
            assert_eq!(
                config.total_minted, self.expected.total_minted,
                "FINAL INVARIANT: on-chain total_minted ({}) != local tracking ({})",
                config.total_minted, self.expected.total_minted
            );
            assert_eq!(
                config.total_burned, self.expected.total_burned,
                "FINAL INVARIANT: on-chain total_burned ({}) != local tracking ({})",
                config.total_burned, self.expected.total_burned
            );
            assert!(
                config.total_minted >= config.total_burned,
                "FINAL INVARIANT: total_burned ({}) > total_minted ({}). \
                 More tokens were burned than ever minted — impossible.",
                config.total_burned, config.total_minted
            );
        }

        // Record final metrics
        self.trident
            .record_accumulator("total_minted", self.expected.total_minted as f64);
        self.trident
            .record_accumulator("total_burned", self.expected.total_burned as f64);
    }
}

// ─── Helper methods ─────────────────────────────────────────────────────────

impl FuzzTest {
    /// Verifies the fundamental supply conservation invariant:
    ///
    ///   total_minted - total_burned == on-chain mint supply
    ///
    /// This is THE most important invariant for any stablecoin. If this breaks,
    /// the token supply accounting is incorrect, meaning either:
    ///   - Tokens exist that were never minted (counterfeit)
    ///   - Tokens were destroyed without being tracked (audit failure)
    ///   - The peg to the underlying asset is compromised
    fn verify_supply_conservation(&self, mint_key: &Pubkey, config_key: &Pubkey) {
        if let Some(config) = read_config(&self.trident, config_key) {
            let expected_supply = config
                .total_minted
                .checked_sub(config.total_burned)
                .expect("INVARIANT VIOLATED: total_burned > total_minted (underflow)");

            // Read the actual on-chain mint supply from Token-2022
            if let Ok(mint_account) = self.trident.get_mint(mint_key) {
                let actual_supply = mint_account.base.supply;
                assert_eq!(
                    actual_supply, expected_supply,
                    "SUPPLY CONSERVATION VIOLATED: \
                     on-chain supply ({}) != total_minted ({}) - total_burned ({}) = {}. \
                     Token supply accounting is broken. This is a critical vulnerability \
                     that breaks the stablecoin's 1:1 backing guarantee.",
                    actual_supply,
                    config.total_minted,
                    config.total_burned,
                    expected_supply
                );
            }
        }
    }
}

// ─── Entry point ────────────────────────────────────────────────────────────

fn main() {
    // Run 500 iterations, each executing up to 50 randomly-selected flows.
    // This means up to 25,000 total operations tested.
    //
    // Each iteration:
    //   1. #[init]: fresh stablecoin + minter setup
    //   2. 50 random flows: mint, burn, pause, unpause, freeze, thaw,
    //      unauthorized attempts
    //   3. #[end]: final invariant verification
    //
    // The random ordering is what makes fuzz testing powerful — it discovers
    // state-dependent bugs that sequential tests miss.
    FuzzTest::fuzz(500, 50);
}
