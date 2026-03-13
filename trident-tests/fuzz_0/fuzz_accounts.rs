use trident_fuzz::fuzzing::*;

/// Storage for all account addresses used in fuzz testing.
///
/// This struct serves as a centralized repository for account addresses,
/// enabling their reuse across different instruction flows and test scenarios.
///
/// Docs: https://ackee.xyz/trident/docs/latest/trident-api-macro/trident-types/fuzz-accounts/
#[derive(Default)]
pub struct AccountAddresses {
    pub payer: AddressStorage,

    pub extra_account_meta_list: AddressStorage,

    pub mint: AddressStorage,

    pub sss_program: AddressStorage,

    pub system_program: AddressStorage,

    pub source_token: AddressStorage,

    pub destination_token: AddressStorage,

    pub owner: AddressStorage,

    pub source_owner_blacklist_entry: AddressStorage,

    pub destination_owner_blacklist_entry: AddressStorage,

    pub blacklister: AddressStorage,

    pub config: AddressStorage,

    pub blacklisted_entry: AddressStorage,

    pub event_authority: AddressStorage,

    pub program: AddressStorage,

    pub burner: AddressStorage,

    pub from: AddressStorage,

    pub burner_role: AddressStorage,

    pub token_program: AddressStorage,

    pub master: AddressStorage,

    pub ata_to_freeze: AddressStorage,

    pub master_role: AddressStorage,

    pub freeze_authority: AddressStorage,

    pub admin: AddressStorage,

    pub mint_authority: AddressStorage,

    pub seizer_authority: AddressStorage,

    pub pause_authority: AddressStorage,

    pub minter_account: AddressStorage,

    pub rent: AddressStorage,

    pub minter: AddressStorage,

    pub to: AddressStorage,

    pub pauser: AddressStorage,

    pub pauser_role: AddressStorage,

    pub seizer: AddressStorage,

    pub seizer_role: AddressStorage,

    pub stablecoin_config: AddressStorage,

    pub ata_to_thaw: AddressStorage,

    pub new_master_role: AddressStorage,

    pub update_minter: AddressStorage,
}
