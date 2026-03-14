use trident_fuzz::fuzzing::*;

#[derive(Default)]
pub struct AccountAddresses {
    pub config: AddressStorage,
    pub mint: AddressStorage,
    pub wallet: AddressStorage,
    pub treasury: AddressStorage,
}
