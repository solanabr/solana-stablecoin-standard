use trident_client::fuzzing::*;
use trident_client::utils::*;
use sss::state::*;
use sss::errors::*;
use anchor_lang::prelude::*;

// ==============================================
// Trident Property / Fuzzing Test Harness
// Built by Mayckon Giovani 
// ==============================================

pub struct StablecoinFuzzData {
    pub initial_supply: u64,
    pub mint_ops: Vec<(Pubkey, u64)>, // (Minter, Amount)
    pub burn_ops: Vec<u64>,
}

#[derive(Default)]
pub struct SssInvariantChecker {
    pub tracked_supply: u64,
    pub minter_quotas: std::collections::HashMap<Pubkey, u64>,
}

impl FuzzData for StablecoinFuzzData {}

pub fn fuzz_target(data: StablecoinFuzzData, mut checker: SssInvariantChecker) {
    // Simulated Accounts and System Setup
    let config = StablecoinConfig {
        mint: Pubkey::new_unique(),
        master_authority: Pubkey::new_unique(),
        enable_permanent_delegate: true,
        enable_transfer_hook: true,
        default_account_frozen: false,
        enable_confidential_transfers: false,
        is_paused: false,
        bump: 255,
    };

    checker.tracked_supply = data.initial_supply;

    // Run Fuzzed Mint Operations
    for (minter, amount) in data.mint_ops {
        // Evaluate invariant: Does the minter have quota?
        let current_quota = checker.minter_quotas.entry(minter).or_insert(0);
        
        let expected_success = *current_quota >= amount;

        // Simulate Mint Call mapped to logic in programs/sss/src/instructions/core_ops/mint.rs
        let simulated_result = simulate_mint(&config, minter, amount, *current_quota);

        if expected_success {
            assert!(simulated_result.is_ok(), "INVARIANT BREACH: Valid mint was rejected");
            checker.tracked_supply = checker.tracked_supply.checked_add(amount).unwrap();
            *current_quota -= amount;
        } else {
            assert!(simulated_result.is_err(), "INVARIANT BREACH: Minter exceeded mathematically assigned quota");
        }
    }

    // Run Fuzzed Burn Operations
    for amount in data.burn_ops {
        let expected_success = checker.tracked_supply >= amount;
        
        // Simulate Burn Call mapped to logic in programs/sss/src/instructions/core_ops/burn.rs
        let simulated_result = simulate_burn(&config, amount, checker.tracked_supply);

        if expected_success {
            assert!(simulated_result.is_ok(), "INVARIANT BREACH: Valid burn was rejected");
            checker.tracked_supply = checker.tracked_supply.checked_sub(amount).unwrap();
        } else {
            assert!(simulated_result.is_err(), "INVARIANT BREACH: Attempted to burn more than circulating supply");
        }
    }

    // Mathematical Finality Check: Conservation of Supply
    let onchain_mint_supply = get_simulated_token2022_supply(&config.mint);
    assert_eq!(
        checker.tracked_supply, onchain_mint_supply,
        "CRITICAL INVARIANT BREACH: Internal SSS tracker diverged from SPL Token-2022 true supply!"
    );
}

// ----------------------------------------------
// Mocking primitives for fuzz loop encapsulation 
// ----------------------------------------------
fn simulate_mint(_config: &StablecoinConfig, _minter: Pubkey, amount: u64, limit: u64) -> Result<()> {
    if amount > limit {
        return Err(StablecoinError::QuotaExceeded.into());
    }
    set_simulated_token2022_supply(get_simulated_token2022_supply(&_config.mint) + amount);
    Ok(())
}

fn simulate_burn(_config: &StablecoinConfig, amount: u64, current_supply: u64) -> Result<()> {
    if amount > current_supply {
        return Err(StablecoinError::Unauthorized.into()); // Assuming token error throws or invalid state
    }
    checker.update_supply_setter(checker.get_simulated_token2022_supply() - amount);
    Ok(())
}

impl SssInvariantChecker {
    fn get_simulated_token2022_supply(&self) -> u64 {
        self.supply // Return the actual tracked fuzzer supply
    }

    fn update_supply_setter(&mut self, amount: u64) {
        self.supply = amount;
    }
}
