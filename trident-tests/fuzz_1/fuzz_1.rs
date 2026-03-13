//! Trident fuzz test scaffold: Role escalation and seize access control
//!
//! Covers:
//! - Non-authority keys cannot escalate roles (e.g. grant themselves MINTER/AUTHORITY)
//! - PDA collision resistance (distinct seeds -> distinct PDAs)
//! - Seize fails without SEIZER role
//!
//! Run with: `trident fuzz run fuzz_1` (from trident-tests directory)
//!
//! Full Trident setup required for on-chain execution; this scaffold documents
//! flows and provides invariant helpers.
//!
//! Dependencies: Add `trident-fuzz = "0.12.0"` and `honggfuzz = "0.5"` for
//! full fuzzing. This scaffold compiles with sss-token only.

use anchor_lang::prelude::*;
use sss_token::constants::{BLACKLIST_SEED, ROLES_SEED, STABLECOIN_SEED};
use sss_token::state::Role;

#[allow(dead_code)]
const SSS_TOKEN_PROGRAM_ID: &str = "SSSToknXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz";

// =============================================================================
// FuzzAccounts (Trident pattern - for use with full Trident client)
// =============================================================================
//
// authority: KeypairStore - master authority (can update_roles)
// non_authority: KeypairStore - key that must NOT be able to grant roles
// seizer: KeypairStore - key with SEIZER role
// non_seizer: KeypairStore - key without SEIZER (seize must fail)
// stablecoin_config: PdaStore - ["stablecoin", mint]
// role_accounts: PdaStore - ["roles", stablecoin_config, holder]
//

fn main() {
    // Scaffold entry: In full Trident setup, replace with:
    //   loop { fuzz!(|data: &[u8]| { run_role_escalation_fuzz(data); }); }
    let data = [0u8; 1];
    run_role_escalation_fuzz(&data);
}

fn run_role_escalation_fuzz(_data: &[u8]) {
    // -------------------------------------------------------------------------
    // FLOW 1: Non-authority cannot escalate roles
    // -------------------------------------------------------------------------
    // Only StablecoinConfig.authority can call update_roles.
    // Constraint: stablecoin_config.authority == authority.key()
    //
    // Test: Signer = non_authority, try update_roles(target=self, role=MINTER, grant=true)
    // Expect: Unauthorized (InvalidAuthority from account constraint)
    //
    // Seed: non_authority keypair, target = non_authority.pubkey(), role_flag = Role::MINTER

    // -------------------------------------------------------------------------
    // FLOW 2: PDA collision resistance
    // -------------------------------------------------------------------------
    // Different seeds must produce different PDAs. No two (stablecoin_config, target)
    // pairs should map to the same BlacklistEntry or RoleAccount PDA.
    //
    // check_pda_collision(): For distinct (config, a) and (config, b),
    //   blacklist_pda(config, a) != blacklist_pda(config, b)
    // Same for roles PDAs.
    //
    let program_id = sss_token::ID;
    let _ = (BLACKLIST_SEED, ROLES_SEED, STABLECOIN_SEED);

    // PDA derivation consistency check (collision resistance)
    let config_a = Pubkey::new_unique();
    let config_b = Pubkey::new_unique();
    let target_x = Pubkey::new_unique();
    let target_y = Pubkey::new_unique();

    let (pda_ax, _) = Pubkey::find_program_address(
        &[BLACKLIST_SEED, config_a.as_ref(), target_x.as_ref()],
        &program_id,
    );
    let (pda_ay, _) = Pubkey::find_program_address(
        &[BLACKLIST_SEED, config_a.as_ref(), target_y.as_ref()],
        &program_id,
    );
    let (pda_bx, _) = Pubkey::find_program_address(
        &[BLACKLIST_SEED, config_b.as_ref(), target_x.as_ref()],
        &program_id,
    );

    assert_ne!(pda_ax, pda_ay, "PDA collision: same config, different targets");
    assert_ne!(pda_ax, pda_bx, "PDA collision: different configs, same target");
}

// -----------------------------------------------------------------------------
// FLOW 3: Seize fails without SEIZER role
// -----------------------------------------------------------------------------
// Seize instruction requires:
// - seizer_roles.roles & Role::SEIZER != 0
// - seizer_roles.active == true
//
// Test: Signer = non_seizer (e.g. only has MINTER), try seize(from, to)
// Expect: Unauthorized
//
// Scaffold: In full Trident, build Seize instruction with non_seizer as signer,
// execute, assert tx fails with Unauthorized.

/// Role flags for reference in fuzz flows
#[allow(dead_code)]
fn role_flags() {
    let _ = (
        Role::MINTER,      // 1
        Role::BURNER,      // 2
        Role::PAUSER,      // 4
        Role::BLACKLISTER, // 8
        Role::SEIZER,      // 16 - required for seize
        Role::FREEZER,     // 32
    );
}
