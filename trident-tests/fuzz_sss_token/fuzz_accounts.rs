use trident_fuzz::fuzzing::*;

/// Storage for all account addresses used in fuzz testing.
///
/// This struct serves as a centralized repository for account addresses,
/// enabling their reuse across different instruction flows and test scenarios.
///
/// Docs: https://ackee.xyz/trident/docs/latest/trident-api-macro/trident-types/fuzz-accounts/
#[derive(Default)]
pub struct AccountAddresses {
    pub new_authority: AddressStorage,

    pub state: AddressStorage,

    pub authority: AddressStorage,

    pub minter: AddressStorage,

    pub minter_info: AddressStorage,

    pub system_program: AddressStorage,

    pub target: AddressStorage,

    pub blacklist_entry: AddressStorage,

    pub mint: AddressStorage,

    pub from_token_account: AddressStorage,

    pub permanent_delegate: AddressStorage,

    pub token_program: AddressStorage,

    pub token_account: AddressStorage,

    pub freeze_authority: AddressStorage,

    pub master_authority: AddressStorage,

    pub rent: AddressStorage,

    pub recipient_token_account: AddressStorage,

    pub mint_authority: AddressStorage,

    pub current_authority: AddressStorage,

    pub proposed_authority: AddressStorage,

    pub target_wallet: AddressStorage,

    pub treasury_token_account: AddressStorage,
}
