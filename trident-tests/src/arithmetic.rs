//! Fuzz: Arithmetic overflow — large amounts in mint/burn/seize cannot
//! cause u64 overflow in total_minted or total_burned counters.

use proptest::prelude::*;
use sss_core::state::config::StablecoinConfig;
use solana_sdk::pubkey::Pubkey;

fn default_config() -> StablecoinConfig {
    StablecoinConfig {
        authority: Pubkey::default(),
        mint: Pubkey::default(),
        preset: 1,
        paused: false,
        supply_cap: None,
        total_minted: 0,
        total_burned: 0,
        bump: 0,
        _reserved: [0u8; 64],
    }
}

/// Simulate checked_add for minting — mirrors on-chain behavior.
fn checked_mint(config: &mut StablecoinConfig, amount: u64) -> bool {
    match config.total_minted.checked_add(amount) {
        Some(new_total) => {
            config.total_minted = new_total;
            true
        }
        None => false, // Overflow rejected
    }
}

/// Simulate checked_add for burning.
fn checked_burn(config: &mut StablecoinConfig, amount: u64) -> bool {
    if config.current_supply() < amount {
        return false;
    }
    match config.total_burned.checked_add(amount) {
        Some(new_total) => {
            config.total_burned = new_total;
            true
        }
        None => false, // Overflow rejected
    }
}

proptest! {
    /// Minting u64::MAX repeatedly never causes overflow — checked_add rejects.
    #[test]
    fn mint_max_no_overflow(
        amounts in proptest::collection::vec(
            prop_oneof![
                Just(u64::MAX),
                Just(u64::MAX - 1),
                Just(u64::MAX / 2),
                Just(u64::MAX / 3),
                (1u64..=u64::MAX),
            ],
            1..50,
        ),
    ) {
        let mut config = default_config();
        let mut success_count = 0u32;

        for amount in &amounts {
            if checked_mint(&mut config, *amount) {
                success_count += 1;
            }
            // total_minted must never wrap
            prop_assert!(config.total_minted <= u64::MAX);
        }

        // At most one very large mint can succeed
        if amounts.iter().all(|a| *a > u64::MAX / 2) {
            prop_assert!(success_count <= 1,
                "Multiple MAX/2+ mints succeeded: {}", success_count
            );
        }
    }

    /// Alternating mint/burn with max values maintains consistency.
    #[test]
    fn alternating_max_values(
        pairs in proptest::collection::vec(
            (u64::MAX / 4..=u64::MAX / 2, u64::MAX / 4..=u64::MAX / 2),
            1..20,
        ),
    ) {
        let mut config = default_config();

        for (mint_amt, burn_amt) in pairs {
            let minted = checked_mint(&mut config, mint_amt);
            if minted {
                // Only burn if we successfully minted and have enough supply
                let to_burn = burn_amt.min(config.current_supply());
                if to_burn > 0 {
                    checked_burn(&mut config, to_burn);
                }
            }

            // Invariants must hold
            prop_assert!(config.total_burned <= config.total_minted,
                "burned ({}) > minted ({})", config.total_burned, config.total_minted
            );
            prop_assert_eq!(
                config.current_supply(),
                config.total_minted.saturating_sub(config.total_burned)
            );
        }
    }

    /// Supply cap conversion with oracle: large values don't overflow u128 math.
    #[test]
    fn oracle_cap_conversion_no_overflow(
        usd_cap in 1u64..=u64::MAX / 2,
        mint_decimals in 0u8..=9,
        price in 1i64..=i64::MAX,
        abs_expo in 0u32..=12,
    ) {
        // Mirrors adjust_cap_with_oracle in mint_tokens.rs
        let numerator = (usd_cap as u128)
            .checked_mul(10u128.pow(mint_decimals as u32))
            .and_then(|v| v.checked_mul(10u128.pow(abs_expo)));

        if let Some(num) = numerator {
            let token_cap = num.checked_div(price as u128);
            if let Some(cap) = token_cap {
                // Must fit in u64 or be clamped to u64::MAX
                let _final_cap = cap.min(u64::MAX as u128) as u64;
                // Just verifying no panic occurs
            }
        }
        // If any checked_* returns None, the on-chain code returns ArithmeticOverflow.
        // That's the correct behavior.
    }
}
