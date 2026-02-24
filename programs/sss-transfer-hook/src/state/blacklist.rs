use anchor_lang::prelude::*;

#[account]
pub struct BlacklistEntry {
  /// The stablecoin mint this entry applies to.
  pub mint: Pubkey,
  /// The wallet address that is blacklisted.
  pub address: Pubkey,
  /// The admin who added this entry.
  pub added_by: Pubkey,
  /// Unix timestamp when the entry was created.
  pub added_at: i64,
  /// Compliance reason for blacklisting (max 128 chars).
  pub reason: String,
  /// PDA bump seed.
  pub bump: u8,
}
