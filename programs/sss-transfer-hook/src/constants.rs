use anchor_lang::prelude::*;

pub const BLACKLIST_SEED: &[u8] = b"blacklist";
pub const MAX_REASON_LEN: usize = 128;

/// BlacklistEntry account space:
/// discriminator(8) + mint(32) + address(32) + added_by(32)
/// + added_at(8) + reason string(4 + 128) + bump(1) = 245
pub const BLACKLIST_SPACE: usize = 245;

/// sss-core program ID for cross-program admin verification.
pub const SSS_CORE_PROGRAM_ID: Pubkey =
  pubkey!("Corep3pXJzUGaqpw2xzWQi4q63cn1STABiCDMJhMECB");

/// sss-core seeds used to derive role PDAs.
pub const SSS_CONFIG_SEED: &[u8] = b"sss-config";
pub const SSS_ROLE_SEED: &[u8] = b"sss-role";
