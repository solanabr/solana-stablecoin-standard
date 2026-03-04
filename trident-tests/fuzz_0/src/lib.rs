//! Trident fuzz helpers for the SSS-token Anchor program.
//!
//! This module contains shared types, seed constants, and PDA-derivation
//! helpers used by the fuzz target binary.

use anchor_lang::prelude::Pubkey;
use arbitrary::Arbitrary;

// ─── Seed constants (must match programs/sss-token/src/state.rs) ──────────────

pub const CONFIG_SEED: &[u8] = b"config";
pub const MINTER_SEED: &[u8] = b"minter";
pub const ROLE_SEED: &[u8] = b"role";
pub const BLACKLIST_SEED: &[u8] = b"blacklist";

// ─── SSS-token program ID ─────────────────────────────────────────────────────

pub const SSS_TOKEN_PROGRAM_ID: &str = "GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp";

// ─── Error codes (must match programs/sss-token/src/error.rs) ─────────────────

pub const ERR_UNAUTHORIZED: u32 = 6000;
pub const ERR_PROGRAM_PAUSED: u32 = 6001;
pub const ERR_INVALID_AMOUNT: u32 = 6002;
pub const ERR_QUOTA_EXCEEDED: u32 = 6003;
pub const ERR_MINTER_INACTIVE: u32 = 6004;
pub const ERR_PENDING_AUTHORITY_EXISTS: u32 = 6005;
pub const ERR_NO_PENDING_AUTHORITY: u32 = 6006;
pub const ERR_BLACKLISTED: u32 = 6007;
pub const ERR_NOT_BLACKLISTED: u32 = 6008;
pub const ERR_SSS2_NOT_ENABLED: u32 = 6009;
pub const ERR_NO_PERMANENT_DELEGATE: u32 = 6010;
pub const ERR_NO_TRANSFER_HOOK: u32 = 6011;
pub const ERR_ROLE_INACTIVE: u32 = 6012;
pub const ERR_MATH_OVERFLOW: u32 = 6013;
pub const ERR_STRING_TOO_LONG: u32 = 6014;

// ─── Fuzz-input types ─────────────────────────────────────────────────────────

/// Describes which SSS-1 / SSS-2 preset a fuzzed initialize call should use.
#[derive(Debug, Clone, Arbitrary)]
pub enum SssPreset {
    /// SSS-1: minimal stablecoin — no compliance extensions.
    Sss1,
    /// SSS-2 with permanent delegate only.
    Sss2PermanentDelegate,
    /// SSS-2 with transfer hook only.
    Sss2TransferHookOnly,
    /// SSS-2 with both extensions (full GENIUS Act compliance).
    Sss2Full,
}

/// All parameters that can be varied when fuzzing `initialize`.
///
/// The `arbitrary` derive gives honggfuzz the ability to generate
/// structured inputs from raw byte sequences.
#[derive(Debug, Clone, Arbitrary)]
pub struct FuzzInitializeParams {
    /// Raw bytes for the token name (UTF-8 loss-truncated to <=32 bytes).
    pub name_bytes: Vec<u8>,
    /// Raw bytes for the symbol (UTF-8 loss-truncated to <=10 bytes).
    pub symbol_bytes: Vec<u8>,
    /// Raw bytes for the URI (UTF-8 loss-truncated to <=200 bytes).
    pub uri_bytes: Vec<u8>,
    /// Token decimals; values above 18 are clamped by `decimals()`.
    pub decimals_raw: u8,
    /// Extension preset selector.
    pub preset: SssPreset,
    /// Whether to set DefaultAccountState to Frozen.
    pub default_frozen: bool,
}

impl FuzzInitializeParams {
    /// Validated name string (<=32 encoded bytes).
    pub fn name(&self) -> String {
        lossy_string(&self.name_bytes, 32)
    }

    /// Validated symbol string (<=10 encoded bytes).
    pub fn symbol(&self) -> String {
        lossy_string(&self.symbol_bytes, 10)
    }

    /// Validated URI string (<=200 encoded bytes).
    pub fn uri(&self) -> String {
        lossy_string(&self.uri_bytes, 200)
    }

    /// Decimals clamped to 0-18.
    pub fn decimals(&self) -> u8 {
        self.decimals_raw.min(18)
    }

    pub fn enable_permanent_delegate(&self) -> bool {
        matches!(
            self.preset,
            SssPreset::Sss2PermanentDelegate | SssPreset::Sss2Full
        )
    }

    pub fn enable_transfer_hook(&self) -> bool {
        matches!(
            self.preset,
            SssPreset::Sss2TransferHookOnly | SssPreset::Sss2Full
        )
    }
}

/// Parameters for fuzzing `mint_to`.
#[derive(Debug, Clone, Arbitrary)]
pub struct FuzzMintParams {
    /// Amount to mint.  0 should trigger `InvalidAmount`.
    pub amount: u64,
    /// Whether the caller should pretend to be paused (for pause-gate fuzzing).
    pub simulate_paused: bool,
}

/// Parameters for fuzzing `burn`.
#[derive(Debug, Clone, Arbitrary)]
pub struct FuzzBurnParams {
    /// Amount to burn.  0 should trigger `InvalidAmount`.
    pub amount: u64,
}

/// Parameters for fuzzing `add_to_blacklist`.
#[derive(Debug, Clone, Arbitrary)]
pub struct FuzzBlacklistParams {
    /// 32-byte seed used to create the target Pubkey.
    pub target_seed: [u8; 32],
    /// Raw reason bytes (UTF-8 loss-truncated to <=128 bytes).
    pub reason_bytes: Vec<u8>,
}

impl FuzzBlacklistParams {
    pub fn target_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.target_seed)
    }

    pub fn reason(&self) -> String {
        lossy_string(&self.reason_bytes, 128)
    }
}

/// Parameters for fuzzing `seize`.
#[derive(Debug, Clone, Arbitrary)]
pub struct FuzzSeizeParams {
    pub amount: u64,
}

/// Top-level fuzz instruction — models any SSS-token instruction.
///
/// `honggfuzz` + `arbitrary` will generate all variants and edges:
/// duplicate transactions, SSS-1 calls on SSS-2-only instructions, etc.
#[derive(Debug, Clone, Arbitrary)]
pub enum FuzzInstruction {
    Initialize(FuzzInitializeParams),
    MintTo(FuzzMintParams),
    Burn(FuzzBurnParams),
    FreezeAccount,
    ThawAccount,
    Pause,
    Unpause,
    AddToBlacklist(FuzzBlacklistParams),
    RemoveFromBlacklist { target_seed: [u8; 32] },
    Seize(FuzzSeizeParams),
    // Authority management
    NominateAuthority { new_authority_seed: [u8; 32] },
    AcceptAuthority,
    // Role management
    AddRole { role_discriminant: u8, address_seed: [u8; 32] },
    RemoveRole { role_discriminant: u8, address_seed: [u8; 32] },
    // Minter management
    AddMinter { quota: u64, minter_seed: [u8; 32] },
    RemoveMinter { minter_seed: [u8; 32] },
}

// ─── PDA derivation helpers ───────────────────────────────────────────────────

/// Derive the config PDA for a given mint pubkey.
pub fn config_pda(mint: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[CONFIG_SEED, mint.as_ref()], program_id)
}

/// Derive the minter role PDA.
pub fn minter_pda(mint: &Pubkey, minter: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[MINTER_SEED, mint.as_ref(), minter.as_ref()], program_id)
}

/// Derive the role PDA for a given role discriminant byte.
///
/// Role discriminants match `RoleType` enum values:
///   0 = Blacklister, 1 = Pauser, 2 = Seizer, 3 = Burner, 4 = Freezer
pub fn role_pda(mint: &Pubkey, role: u8, address: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[ROLE_SEED, mint.as_ref(), &[role], address.as_ref()],
        program_id,
    )
}

/// Derive the blacklist entry PDA.
pub fn blacklist_pda(mint: &Pubkey, target: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[BLACKLIST_SEED, mint.as_ref(), target.as_ref()],
        program_id,
    )
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/// Convert arbitrary bytes to a valid UTF-8 string, replacing non-UTF-8
/// sequences with U+FFFD and truncating to `max_bytes` encoded bytes on a
/// char boundary.
fn lossy_string(bytes: &[u8], max_bytes: usize) -> String {
    let s = String::from_utf8_lossy(bytes).into_owned();
    let mut end = max_bytes.min(s.len());
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].to_string()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lossy_string_truncates_on_char_boundary() {
        // 4-byte emoji: should be dropped entirely if max_bytes < 4
        let emoji = "🦀"; // 4 bytes
        let result = lossy_string(emoji.as_bytes(), 3);
        assert!(result.is_empty() || result.len() <= 3);
        assert!(std::str::from_utf8(result.as_bytes()).is_ok());
    }

    #[test]
    fn lossy_string_respects_max() {
        let long = "a".repeat(200);
        let result = lossy_string(long.as_bytes(), 32);
        assert_eq!(result.len(), 32);
    }

    #[test]
    fn decimals_clamped_to_18() {
        let params = FuzzInitializeParams {
            name_bytes: b"Token".to_vec(),
            symbol_bytes: b"TKN".to_vec(),
            uri_bytes: b"https://example.com".to_vec(),
            decimals_raw: 255,
            preset: SssPreset::Sss1,
            default_frozen: false,
        };
        assert_eq!(params.decimals(), 18);
    }

    #[test]
    fn pda_derivation_is_deterministic() {
        let program_id: Pubkey = "GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp"
            .parse()
            .unwrap();
        let mint = Pubkey::new_unique();
        let (pda1, bump1) = config_pda(&mint, &program_id);
        let (pda2, bump2) = config_pda(&mint, &program_id);
        assert_eq!(pda1, pda2);
        assert_eq!(bump1, bump2);
    }
}
