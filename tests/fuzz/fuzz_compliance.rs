// Trident Fuzz Test: Compliance Operations (SSS-2)
//
// Fuzz targets for blacklist and seize operations.
// See fuzz_roles.rs for setup instructions.

use arbitrary::Arbitrary;

/// Fuzzed compliance operation sequence.
#[derive(Debug, Arbitrary)]
enum FuzzedComplianceOp {
    /// Blacklist an address
    Blacklist { target_index: u8 },
    /// Remove from blacklist
    Unblacklist { target_index: u8 },
    /// Seize tokens from a blacklisted account
    Seize {
        target_index: u8,
        source_index: u8,  // May not match target (should fail)
        amount: u64,
    },
}

/// Invariants:
///
/// 1. Seize ONLY succeeds when source token account owner == blacklisted address
/// 2. Seize ALWAYS fails if no BlacklistEntry PDA exists for the target
/// 3. Double-blacklist always fails (account already initialized)
/// 4. After unblacklist, seize always fails
/// 5. Only Blacklister role can add/remove from blacklist
/// 6. Only Seizer role can seize
/// 7. Compliance ops always fail on SSS-1 mints
