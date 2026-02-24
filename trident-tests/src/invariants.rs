//! Core invariants that must hold across all fuzz scenarios.

use sss_core::state::config::StablecoinConfig;

/// Invariant: current_supply == total_minted - total_burned (saturating).
pub fn check_supply_invariant(config: &StablecoinConfig) {
    let expected = config.total_minted.saturating_sub(config.total_burned);
    assert_eq!(
        config.current_supply(),
        expected,
        "Supply invariant violated: current_supply() != total_minted - total_burned"
    );
}

/// Invariant: if supply cap exists, current supply must not exceed it.
pub fn check_cap_invariant(config: &StablecoinConfig) {
    if let Some(cap) = config.supply_cap {
        assert!(
            config.current_supply() <= cap,
            "Cap invariant violated: current_supply ({}) > cap ({})",
            config.current_supply(),
            cap,
        );
    }
}

/// Invariant: total_burned can never exceed total_minted in a valid state.
pub fn check_burn_invariant(config: &StablecoinConfig) {
    // In practice burns are guarded by token balance, but the config
    // itself uses saturating subtraction. total_burned > total_minted
    // would indicate an accounting bug.
    assert!(
        config.total_burned <= config.total_minted,
        "Burn invariant violated: total_burned ({}) > total_minted ({})",
        config.total_burned,
        config.total_minted,
    );
}

/// Run all invariant checks.
pub fn check_all_invariants(config: &StablecoinConfig) {
    check_supply_invariant(config);
    check_cap_invariant(config);
    check_burn_invariant(config);
}
