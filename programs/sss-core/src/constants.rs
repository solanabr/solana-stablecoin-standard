pub const SSS_CONFIG_SEED: &[u8] = b"sss-config";
pub const SSS_ROLE_SEED: &[u8] = b"sss-role";

/// StablecoinConfig account space:
/// discriminator(8) + authority(32) + mint(32) + preset(1) + paused(1)
/// + supply_cap Option<u64>(1+8) + total_minted(8) + total_burned(8)
/// + bump(1) + _reserved(64) = 164
pub const CONFIG_SPACE: usize = 164;

/// RoleAccount space:
/// discriminator(8) + config(32) + address(32) + role(1)
/// + granted_by(32) + granted_at(8) + bump(1)
/// + mint_quota Option<u64>(1+8) + amount_minted(8) = 131
pub const ROLE_SPACE: usize = 131;
