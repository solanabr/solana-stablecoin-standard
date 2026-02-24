//! Fuzz: Supply cap overflow — random mint/burn sequences cannot exceed cap.

use proptest::prelude::*;
use sss_core::state::config::StablecoinConfig;
use solana_sdk::pubkey::Pubkey;

use crate::invariants::check_all_invariants;

/// Simulated mint operation on the config (mirrors on-chain logic).
fn sim_mint(config: &mut StablecoinConfig, amount: u64) -> bool {
    if config.paused || amount == 0 {
        return false;
    }

    let new_total = match config.total_minted.checked_add(amount) {
        Some(v) => v,
        None => return false,
    };

    let would_supply = new_total.saturating_sub(config.total_burned);
    if let Some(cap) = config.supply_cap {
        if would_supply > cap {
            return false;
        }
    }

    config.total_minted = new_total;
    true
}

/// Simulated burn operation on the config.
fn sim_burn(config: &mut StablecoinConfig, amount: u64) -> bool {
    if config.paused || amount == 0 {
        return false;
    }

    // On-chain: burn requires token balance >= amount.
    // Here we check that current_supply >= amount (simplified).
    if config.current_supply() < amount {
        return false;
    }

    let new_burned = match config.total_burned.checked_add(amount) {
        Some(v) => v,
        None => return false,
    };

    config.total_burned = new_burned;
    true
}

fn default_config(cap: Option<u64>) -> StablecoinConfig {
    StablecoinConfig {
        authority: Pubkey::default(),
        mint: Pubkey::default(),
        preset: 1,
        paused: false,
        supply_cap: cap,
        total_minted: 0,
        total_burned: 0,
        bump: 0,
        _reserved: [0u8; 64],
    }
}

/// Enum for random operation sequences.
#[derive(Debug, Clone)]
enum Op {
    Mint(u64),
    Burn(u64),
}

fn op_strategy() -> impl Strategy<Value = Op> {
    prop_oneof![
        // Bias toward realistic amounts but include edge cases
        (1u64..=1_000_000_000u64).prop_map(Op::Mint),
        (1u64..=1_000_000_000u64).prop_map(Op::Burn),
        // Edge cases: very large amounts
        (u64::MAX / 2..=u64::MAX).prop_map(Op::Mint),
        (u64::MAX / 2..=u64::MAX).prop_map(Op::Burn),
        // Edge cases: tiny amounts
        (1u64..=10u64).prop_map(Op::Mint),
        (1u64..=10u64).prop_map(Op::Burn),
    ]
}

proptest! {
    /// Random mint/burn sequences with a supply cap never violate invariants.
    #[test]
    fn supply_cap_never_exceeded(
        cap in 1u64..=10_000_000_000u64,
        ops in proptest::collection::vec(op_strategy(), 1..100),
    ) {
        let mut config = default_config(Some(cap));

        for op in ops {
            match op {
                Op::Mint(amount) => { sim_mint(&mut config, amount); }
                Op::Burn(amount) => { sim_burn(&mut config, amount); }
            }
            check_all_invariants(&config);
        }
    }

    /// Random mint/burn sequences without a cap never cause overflow.
    #[test]
    fn no_cap_no_overflow(
        ops in proptest::collection::vec(op_strategy(), 1..100),
    ) {
        let mut config = default_config(None);

        for op in ops {
            match op {
                Op::Mint(amount) => { sim_mint(&mut config, amount); }
                Op::Burn(amount) => { sim_burn(&mut config, amount); }
            }
            check_all_invariants(&config);
        }
    }

    /// After any sequence of operations, current_supply is always consistent.
    #[test]
    fn supply_always_consistent(
        cap in proptest::option::of(1u64..=u64::MAX / 2),
        ops in proptest::collection::vec(op_strategy(), 1..200),
    ) {
        let mut config = default_config(cap);
        let mut expected_minted: u64 = 0;
        let mut expected_burned: u64 = 0;

        for op in ops {
            match op {
                Op::Mint(amount) => {
                    if sim_mint(&mut config, amount) {
                        expected_minted = expected_minted.checked_add(amount).unwrap();
                    }
                }
                Op::Burn(amount) => {
                    if sim_burn(&mut config, amount) {
                        expected_burned = expected_burned.checked_add(amount).unwrap();
                    }
                }
            }
        }

        prop_assert_eq!(config.total_minted, expected_minted);
        prop_assert_eq!(config.total_burned, expected_burned);
        prop_assert_eq!(
            config.current_supply(),
            expected_minted.saturating_sub(expected_burned)
        );
    }
}
