// =============================================================================
// fuzz_accounts.rs — Account address storage for fuzz_1 (Multi-User Chaos)
// =============================================================================
//
// This fuzzer exercises multi-user scenarios: multiple minters with separate
// quotas, role updates, and authority transfers. The account storage reflects
// a more complex deployment with several independent actors.

use trident_fuzz::fuzzing::*;

/// Number of distinct minters to simulate.
/// Each minter has their own quota and tracks minted_amount independently.
pub const NUM_MINTERS: usize = 3;

/// Account addresses for the multi-user chaos fuzzer.
///
/// This models a realistic deployment with:
/// - An authority who holds the master keys
/// - A separate master_minter (after role update)
/// - A separate pauser (after role update)
/// - Multiple independent minters with isolated quotas
/// - A candidate for authority transfer (two-step process)
#[derive(Default)]
pub struct FuzzAccounts {
    // ── Core accounts (same across both fuzzers) ────────────────────────────

    /// The initial authority keypair.
    pub authority: AddressStorage,

    /// The Token-2022 mint keypair.
    pub mint: AddressStorage,

    /// StablecoinConfig PDA.
    pub config: AddressStorage,

    /// Mint authority PDA.
    pub mint_authority: AddressStorage,

    // ── Multi-minter accounts ───────────────────────────────────────────────

    /// Minter wallet keypairs. Each is an independent minter with separate quota.
    pub minter_wallets: [AddressStorage; NUM_MINTERS],

    /// MinterState PDAs, one per minter wallet.
    pub minter_states: [AddressStorage; NUM_MINTERS],

    /// Token accounts for each minter to receive minted tokens.
    pub minter_token_accounts: [AddressStorage; NUM_MINTERS],

    // ── Role management accounts ────────────────────────────────────────────

    /// A separate master_minter address (after update_role reassigns it).
    pub new_master_minter: AddressStorage,

    /// A separate pauser address (after update_role reassigns it).
    pub new_pauser: AddressStorage,

    /// A separate blacklister address (after update_role reassigns it).
    pub new_blacklister: AddressStorage,

    // ── Authority transfer accounts ─────────────────────────────────────────

    /// The pending authority candidate for two-step transfer.
    pub pending_authority: AddressStorage,

    // ── Unauthorized accounts ───────────────────────────────────────────────

    /// Multiple random signers for access control testing.
    pub random_signers: [AddressStorage; 2],
}
