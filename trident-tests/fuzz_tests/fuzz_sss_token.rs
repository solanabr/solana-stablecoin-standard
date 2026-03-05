/// Trident Fuzz Test Scaffold for SSS-Token
///
/// This module defines fuzz test targets for the SSS-Token program.
/// Each test randomly generates instruction sequences to find invariant violations.
///
/// ## Running
/// ```sh
/// # Install Trident (if not already)
/// cargo install trident-cli
///
/// # Run the fuzz tests
/// trident fuzz run fuzz_sss_token
/// ```
///
/// ## Architecture
/// - `FuzzAccounts`: pre-generated accounts for the fuzzer
/// - `InstructionSequence`: random sequences of SSS-Token instructions
/// - Invariants checked after each tx:
///   1. total_minted >= total_burned
///   2. paused => all mint/burn/transfer fail
///   3. blacklisted account => cannot receive tokens (SSS-2)
///   4. inactive minter => cannot mint

use anchor_lang::prelude::*;

// NOTE: Full Trident integration requires the `trident-client` and
// `trident-derive-accounts-snapshots` crates. This scaffold provides
// the structure; replace with generated code once `trident init` is run
// inside the workspace.

/// Accounts pre-created for fuzzing
pub struct FuzzAccounts {
    pub authority: AccountId,
    pub minter: AccountId,
    pub user_a: AccountId,
    pub user_b: AccountId,
    pub mint: AccountId,
}

/// Fuzz instruction variants matching the SSS-Token program
pub enum FuzzInstruction {
    /// Initialize a new stablecoin (called once at the start)
    Initialize {
        name: String,
        symbol: String,
        decimals: u8,
    },
    /// Mint tokens to destination
    Mint {
        amount: u64,
    },
    /// Burn tokens
    Burn {
        amount: u64,
    },
    /// Pause the stablecoin (only authority)
    Pause,
    /// Unpause the stablecoin
    Unpause,
    /// Freeze a specific account
    FreezeAccount,
    /// Thaw a frozen account
    ThawAccount,
    /// Add a new minter
    AddMinter {
        quota: u64,
    },
    /// Remove a minter
    RemoveMinter,
    /// (SSS-2) Add address to blacklist
    BlacklistAdd {
        reason: String,
    },
    /// (SSS-2) Remove address from blacklist
    BlacklistRemove,
    /// (SSS-2) Seize tokens from blacklisted address
    Seize,
}

/// Invariants that must hold after every instruction sequence
pub fn check_invariants(
    state_total_minted: u64,
    state_total_burned: u64,
    state_paused: bool,
    mint_succeeded: bool,
) {
    // Invariant 1: total_minted >= total_burned (no underflow)
    assert!(
        state_total_minted >= state_total_burned,
        "INVARIANT VIOLATION: total_minted ({}) < total_burned ({})",
        state_total_minted,
        state_total_burned,
    );

    // Invariant 2: if paused, mint/burn must fail
    if state_paused {
        assert!(
            !mint_succeeded,
            "INVARIANT VIOLATION: mint succeeded while paused"
        );
    }
}

/// Entry point for honggfuzz
/// When `trident init` is run, this will be replaced with the generated harness.
///
/// Example generated flow:
/// ```ignore
/// fn main() {
///     loop {
///         fuzz!(|data: &[u8]| {
///             let mut fuzz_data = FuzzData::deserialize(data);
///             let mut ctx = FuzzContext::new();
///             for ix in fuzz_data.instructions {
///                 ctx.execute(ix);
///                 check_invariants(...);
///             }
///         });
///     }
/// }
/// ```
fn main() {
    eprintln!("Trident fuzz scaffold — run `trident init` then `trident fuzz run fuzz_sss_token`");
}

/// Account ID placeholder for Trident's account management
type AccountId = u8;
