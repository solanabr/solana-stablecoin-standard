// =============================================================================
// fuzz_accounts.rs — Account address storage for fuzz_0 (Core Operations)
// =============================================================================
//
// This module stores keypairs and PDA addresses used across fuzz flows.
// Trident's `AddressStorage` provides deterministic-yet-random account
// generation, allowing the fuzzer to reuse accounts across flows within
// a single iteration while keeping iterations independent.
//
// Each `AddressStorage` field is a map of Pubkeys. You insert addresses
// (random keypairs or PDAs) and later retrieve them with `get()`.

use trident_fuzz::fuzzing::*;

/// Account addresses shared across all flows in fuzz_0.
///
/// The core operations fuzzer needs:
/// - A single authority who initializes the stablecoin and holds all roles
/// - A mint keypair for the Token-2022 stablecoin
/// - The config PDA derived from the mint
/// - The mint authority PDA derived from the mint
/// - A minter wallet and its minter_state PDA
/// - A destination token account for minting into
/// - A burner token account for burn testing
#[derive(Default)]
pub struct FuzzAccounts {
    /// The authority/admin keypair. Holds authority, master_minter, pauser,
    /// and blacklister roles after initialization.
    pub authority: AddressStorage,

    /// The Token-2022 mint keypair. Must be a signer during initialize.
    pub mint: AddressStorage,

    /// The StablecoinConfig PDA: seeds = [b"config", mint.key()]
    pub config: AddressStorage,

    /// The mint authority PDA: seeds = [b"mint-authority", mint.key()]
    pub mint_authority: AddressStorage,

    /// The minter wallet keypair. This is the wallet that will be authorized
    /// to mint tokens via configure_minter.
    pub minter: AddressStorage,

    /// The MinterState PDA: seeds = [b"minter", config.key(), minter.key()]
    pub minter_state: AddressStorage,

    /// Destination token account for receiving minted tokens.
    pub destination_token_account: AddressStorage,

    /// Token account owned by burner for burn testing.
    pub burner_token_account: AddressStorage,

    /// An unauthorized random keypair used to test access control.
    /// This account should NEVER be able to perform privileged operations.
    pub random_signer: AddressStorage,

    /// The pauser keypair (initially same as authority, but may be updated).
    pub pauser: AddressStorage,

    /// The blacklister keypair (initially same as authority).
    pub blacklister: AddressStorage,
}
