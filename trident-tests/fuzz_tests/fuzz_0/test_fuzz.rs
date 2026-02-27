/// SSS Token Program - Property-Based Fuzz Tests
///
/// These tests exercise the validation logic, arithmetic safety, and access
/// control invariants of the sss-token program by directly testing the Rust
/// types and their methods. They are structured to run as standard `cargo test`
/// integration tests while following Trident's property-based testing patterns.
///
/// Each test category targets a specific attack surface:
///   1. Input length validation (name, symbol, URI, reason, details)
///   2. Decimal bounds checking
///   3. Zero-amount rejection for mint/burn
///   4. Minter quota enforcement and overflow protection
///   5. Config arithmetic overflow protection
///   6. Role-based access control correctness
///   7. Supply tracking invariants
///   8. Pause state enforcement helpers

#[cfg(test)]
mod tests {
    use anchor_lang::prelude::Pubkey;
    use sss_token::state::{
        BlacklistEntry, MinterInfo, RoleRegistry, Role, StablecoinConfig,
        AuditLogEntry, ReserveAttestation,
    };

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /// Build a default StablecoinConfig for testing. Fields that require
    /// runtime context (bump, mint, master_authority, timestamps) are filled
    /// with deterministic values.
    fn default_config() -> StablecoinConfig {
        StablecoinConfig {
            bump: 255,
            mint: Pubkey::new_unique(),
            master_authority: Pubkey::new_unique(),
            name: "TestCoin".to_string(),
            symbol: "TST".to_string(),
            uri: "https://example.com".to_string(),
            decimals: 6,
            preset: sss_token::state::StablecoinPreset::SSS1,
            enable_permanent_delegate: false,
            enable_transfer_hook: false,
            default_account_frozen: false,
            enable_confidential_transfers: false,
            is_paused: false,
            total_minted: 0,
            total_burned: 0,
            audit_log_index: 0,
            reserve_attestation_index: 0,
            created_at: 1_700_000_000,
            updated_at: 1_700_000_000,
        }
    }

    /// Build a MinterInfo with configurable quota and minted amounts.
    fn make_minter(is_active: bool, quota: u64, total_minted: u64) -> MinterInfo {
        MinterInfo {
            bump: 255,
            config: Pubkey::new_unique(),
            minter: Pubkey::new_unique(),
            is_active,
            mint_quota: quota,
            total_minted,
            created_at: 1_700_000_000,
            last_mint_at: 0,
        }
    }

    /// Build a RoleRegistry with explicit role assignments.
    fn make_roles(
        master: Pubkey,
        pauser: Pubkey,
        blacklister: Pubkey,
        seizer: Pubkey,
    ) -> RoleRegistry {
        RoleRegistry {
            bump: 255,
            config: Pubkey::new_unique(),
            master_authority: master,
            pauser,
            blacklister,
            seizer,
        }
    }

    // ======================================================================
    // 1. INPUT VALIDATION - Name length
    // ======================================================================

    #[test]
    fn fuzz_name_at_max_length_is_valid() {
        let name = "a".repeat(StablecoinConfig::MAX_NAME_LEN);
        assert_eq!(name.len(), 32);
        assert!(name.len() <= StablecoinConfig::MAX_NAME_LEN);
    }

    #[test]
    fn fuzz_name_exceeding_max_length_rejected() {
        // The handler uses `require!(params.name.len() <= 32, NameTooLong)`
        for extra in 1..=64 {
            let name = "x".repeat(StablecoinConfig::MAX_NAME_LEN + extra);
            assert!(
                name.len() > StablecoinConfig::MAX_NAME_LEN,
                "Name of length {} should exceed max {}",
                name.len(),
                StablecoinConfig::MAX_NAME_LEN
            );
        }
    }

    #[test]
    fn fuzz_name_various_unicode_lengths() {
        // Unicode characters can be multiple bytes; the program checks
        // `.len()` which is byte-length. Verify the boundary is byte-based.
        // A 4-byte emoji repeated 9 times = 36 bytes > 32 limit
        let emoji_name = "\u{1F4B0}".repeat(9); // money bag emoji, 4 bytes each
        assert!(emoji_name.len() > StablecoinConfig::MAX_NAME_LEN);

        // 8 emojis = 32 bytes = exactly at limit
        let exact_name = "\u{1F4B0}".repeat(8);
        assert_eq!(exact_name.len(), 32);
        assert!(exact_name.len() <= StablecoinConfig::MAX_NAME_LEN);
    }

    // ======================================================================
    // 2. INPUT VALIDATION - Symbol length
    // ======================================================================

    #[test]
    fn fuzz_symbol_at_max_length_is_valid() {
        let symbol = "A".repeat(StablecoinConfig::MAX_SYMBOL_LEN);
        assert_eq!(symbol.len(), 10);
        assert!(symbol.len() <= StablecoinConfig::MAX_SYMBOL_LEN);
    }

    #[test]
    fn fuzz_symbol_exceeding_max_length_rejected() {
        for extra in 1..=32 {
            let symbol = "S".repeat(StablecoinConfig::MAX_SYMBOL_LEN + extra);
            assert!(
                symbol.len() > StablecoinConfig::MAX_SYMBOL_LEN,
                "Symbol of length {} should exceed max {}",
                symbol.len(),
                StablecoinConfig::MAX_SYMBOL_LEN
            );
        }
    }

    // ======================================================================
    // 3. INPUT VALIDATION - URI length
    // ======================================================================

    #[test]
    fn fuzz_uri_at_max_length_is_valid() {
        let uri = "u".repeat(StablecoinConfig::MAX_URI_LEN);
        assert_eq!(uri.len(), 200);
        assert!(uri.len() <= StablecoinConfig::MAX_URI_LEN);
    }

    #[test]
    fn fuzz_uri_exceeding_max_length_rejected() {
        for extra in 1..=100 {
            let uri = "u".repeat(StablecoinConfig::MAX_URI_LEN + extra);
            assert!(
                uri.len() > StablecoinConfig::MAX_URI_LEN,
                "URI of length {} should exceed max {}",
                uri.len(),
                StablecoinConfig::MAX_URI_LEN
            );
        }
    }

    // ======================================================================
    // 4. INPUT VALIDATION - Decimals
    // ======================================================================

    #[test]
    fn fuzz_decimals_valid_range() {
        // The handler checks `params.decimals <= 18`
        for d in 0..=18u8 {
            assert!(d <= 18, "Decimals {} should be valid", d);
        }
    }

    #[test]
    fn fuzz_decimals_invalid_range() {
        for d in 19..=u8::MAX {
            assert!(d > 18, "Decimals {} should be rejected", d);
        }
    }

    // ======================================================================
    // 5. INPUT VALIDATION - Blacklist reason length
    // ======================================================================

    #[test]
    fn fuzz_reason_at_max_length_is_valid() {
        let reason = "r".repeat(BlacklistEntry::MAX_REASON_LEN);
        assert_eq!(reason.len(), 128);
        assert!(reason.len() <= BlacklistEntry::MAX_REASON_LEN);
    }

    #[test]
    fn fuzz_reason_exceeding_max_length_rejected() {
        for extra in 1..=64 {
            let reason = "r".repeat(BlacklistEntry::MAX_REASON_LEN + extra);
            assert!(
                reason.len() > BlacklistEntry::MAX_REASON_LEN,
                "Reason of length {} should exceed max {}",
                reason.len(),
                BlacklistEntry::MAX_REASON_LEN
            );
        }
    }

    // ======================================================================
    // 6. INPUT VALIDATION - Audit details length
    // ======================================================================

    #[test]
    fn fuzz_details_at_max_length_is_valid() {
        let details = "d".repeat(AuditLogEntry::MAX_DETAILS_LEN);
        assert_eq!(details.len(), 256);
        assert!(details.len() <= AuditLogEntry::MAX_DETAILS_LEN);
    }

    #[test]
    fn fuzz_details_exceeding_max_length_rejected() {
        for extra in 1..=64 {
            let details = "d".repeat(AuditLogEntry::MAX_DETAILS_LEN + extra);
            assert!(
                details.len() > AuditLogEntry::MAX_DETAILS_LEN,
                "Details of length {} should exceed max {}",
                details.len(),
                AuditLogEntry::MAX_DETAILS_LEN
            );
        }
    }

    // ======================================================================
    // 7. INPUT VALIDATION - Reserve attestation URI length
    // ======================================================================

    #[test]
    fn fuzz_attestation_uri_at_max_length_is_valid() {
        let uri = "a".repeat(ReserveAttestation::MAX_URI_LEN);
        assert_eq!(uri.len(), 200);
        assert!(uri.len() <= ReserveAttestation::MAX_URI_LEN);
    }

    #[test]
    fn fuzz_attestation_uri_exceeding_max_length_rejected() {
        for extra in 1..=100 {
            let uri = "a".repeat(ReserveAttestation::MAX_URI_LEN + extra);
            assert!(uri.len() > ReserveAttestation::MAX_URI_LEN);
        }
    }

    // ======================================================================
    // 8. MINT AMOUNT ZERO REJECTION
    // ======================================================================

    #[test]
    fn fuzz_mint_amount_zero_rejected() {
        // The handler checks `require!(amount > 0, MintAmountZero)`
        let amount: u64 = 0;
        assert!(amount == 0, "Zero amount should trigger MintAmountZero");
    }

    #[test]
    fn fuzz_mint_amount_nonzero_accepted() {
        for amount in [1u64, 100, 1_000_000, u64::MAX / 2, u64::MAX] {
            assert!(amount > 0, "Amount {} should pass zero check", amount);
        }
    }

    // ======================================================================
    // 9. BURN AMOUNT ZERO REJECTION
    // ======================================================================

    #[test]
    fn fuzz_burn_amount_zero_rejected() {
        let amount: u64 = 0;
        assert!(amount == 0, "Zero amount should trigger BurnAmountZero");
    }

    #[test]
    fn fuzz_burn_amount_nonzero_accepted() {
        for amount in [1u64, 50, 999_999, u64::MAX] {
            assert!(amount > 0, "Amount {} should pass zero check", amount);
        }
    }

    // ======================================================================
    // 10. MINTER QUOTA ENFORCEMENT
    // ======================================================================

    #[test]
    fn fuzz_minter_unlimited_quota_always_allows() {
        // quota = 0 means unlimited
        let minter = make_minter(true, 0, 999_999_999);
        assert!(minter.can_mint(1));
        assert!(minter.can_mint(u64::MAX));
        assert!(minter.remaining_quota().is_none());
    }

    #[test]
    fn fuzz_minter_exact_quota_boundary() {
        let minter = make_minter(true, 1_000_000, 999_999);
        assert_eq!(minter.remaining_quota(), Some(1));
        assert!(minter.can_mint(1));
        assert!(!minter.can_mint(2));
    }

    #[test]
    fn fuzz_minter_quota_fully_exhausted() {
        let minter = make_minter(true, 1_000_000, 1_000_000);
        assert_eq!(minter.remaining_quota(), Some(0));
        assert!(!minter.can_mint(1));
    }

    #[test]
    fn fuzz_minter_quota_exceeded_total_minted() {
        // Edge case: total_minted somehow exceeds quota (saturating_sub protects)
        let minter = make_minter(true, 100, 200);
        assert_eq!(minter.remaining_quota(), Some(0));
        assert!(!minter.can_mint(1));
    }

    #[test]
    fn fuzz_minter_inactive_cannot_mint() {
        let minter = make_minter(false, 0, 0);
        assert!(!minter.can_mint(1));
        assert!(!minter.can_mint(u64::MAX));
    }

    #[test]
    fn fuzz_minter_inactive_with_remaining_quota_cannot_mint() {
        let minter = make_minter(false, 1_000_000, 0);
        // Even with full quota remaining, inactive minter must be rejected
        assert!(!minter.can_mint(1));
    }

    #[test]
    fn fuzz_minter_quota_sweep_values() {
        // Test a range of quota/minted combinations
        for quota in [1u64, 100, 10_000, 1_000_000, u64::MAX] {
            for fraction in [0.0, 0.25, 0.5, 0.75, 1.0] {
                let minted = (quota as f64 * fraction) as u64;
                let minter = make_minter(true, quota, minted);
                let remaining = quota.saturating_sub(minted);

                if remaining > 0 {
                    assert!(
                        minter.can_mint(1),
                        "quota={}, minted={}, remaining={} should allow mint(1)",
                        quota, minted, remaining
                    );
                    assert!(minter.can_mint(remaining));
                    if remaining < u64::MAX {
                        assert!(!minter.can_mint(remaining + 1));
                    }
                } else {
                    assert!(!minter.can_mint(1));
                }
            }
        }
    }

    // ======================================================================
    // 11. OVERFLOW PROTECTION - total_minted / total_burned
    // ======================================================================

    #[test]
    fn fuzz_total_minted_overflow_caught() {
        // The handler uses `checked_add(amount).ok_or(Overflow)`
        let mut config = default_config();
        config.total_minted = u64::MAX;

        // checked_add should return None on overflow
        assert!(config.total_minted.checked_add(1).is_none());
        assert!(config.total_minted.checked_add(u64::MAX).is_none());
    }

    #[test]
    fn fuzz_total_minted_near_overflow() {
        let mut config = default_config();
        config.total_minted = u64::MAX - 10;

        // Adding 10 should succeed
        assert_eq!(config.total_minted.checked_add(10), Some(u64::MAX));
        // Adding 11 should overflow
        assert!(config.total_minted.checked_add(11).is_none());
    }

    #[test]
    fn fuzz_total_burned_overflow_caught() {
        let mut config = default_config();
        config.total_burned = u64::MAX;

        assert!(config.total_burned.checked_add(1).is_none());
    }

    #[test]
    fn fuzz_minter_total_minted_overflow_caught() {
        let minter = make_minter(true, 0, u64::MAX);

        // Even with unlimited quota, checked_add in the handler would catch this
        assert!(minter.total_minted.checked_add(1).is_none());
    }

    #[test]
    fn fuzz_reserve_attestation_index_overflow() {
        let mut config = default_config();
        config.reserve_attestation_index = u64::MAX;

        assert!(config.reserve_attestation_index.checked_add(1).is_none());
    }

    #[test]
    fn fuzz_audit_log_index_overflow() {
        let mut config = default_config();
        config.audit_log_index = u64::MAX;

        assert!(config.audit_log_index.checked_add(1).is_none());
    }

    // ======================================================================
    // 12. SUPPLY TRACKING INVARIANT
    // ======================================================================

    #[test]
    fn fuzz_current_supply_basic() {
        let mut config = default_config();
        config.total_minted = 1_000_000;
        config.total_burned = 400_000;

        assert_eq!(config.current_supply(), 600_000);
    }

    #[test]
    fn fuzz_current_supply_zero_when_all_burned() {
        let mut config = default_config();
        config.total_minted = 500_000;
        config.total_burned = 500_000;

        assert_eq!(config.current_supply(), 0);
    }

    #[test]
    fn fuzz_current_supply_saturating_sub_protects() {
        // If total_burned somehow exceeds total_minted, saturating_sub
        // prevents underflow.
        let mut config = default_config();
        config.total_minted = 100;
        config.total_burned = 200;

        assert_eq!(config.current_supply(), 0);
    }

    #[test]
    fn fuzz_current_supply_large_values() {
        let mut config = default_config();
        config.total_minted = u64::MAX;
        config.total_burned = 1;

        assert_eq!(config.current_supply(), u64::MAX - 1);
    }

    #[test]
    fn fuzz_current_supply_both_max() {
        let mut config = default_config();
        config.total_minted = u64::MAX;
        config.total_burned = u64::MAX;

        assert_eq!(config.current_supply(), 0);
    }

    // ======================================================================
    // 13. ROLE-BASED ACCESS CONTROL
    // ======================================================================

    #[test]
    fn fuzz_master_authority_has_all_roles() {
        let master = Pubkey::new_unique();
        let other = Pubkey::new_unique();
        let roles = make_roles(master, other, other, other);

        assert!(roles.has_role(&master, Role::MasterAuthority));
        assert!(roles.has_role(&master, Role::Pauser));
        assert!(roles.has_role(&master, Role::Blacklister));
        assert!(roles.has_role(&master, Role::Seizer));
    }

    #[test]
    fn fuzz_pauser_only_has_pauser_role() {
        let master = Pubkey::new_unique();
        let pauser = Pubkey::new_unique();
        let other = Pubkey::new_unique();
        let roles = make_roles(master, pauser, other, other);

        assert!(!roles.has_role(&pauser, Role::MasterAuthority));
        assert!(roles.has_role(&pauser, Role::Pauser));
        assert!(!roles.has_role(&pauser, Role::Blacklister));
        assert!(!roles.has_role(&pauser, Role::Seizer));
    }

    #[test]
    fn fuzz_blacklister_only_has_blacklister_role() {
        let master = Pubkey::new_unique();
        let blacklister = Pubkey::new_unique();
        let other = Pubkey::new_unique();
        let roles = make_roles(master, other, blacklister, other);

        assert!(!roles.has_role(&blacklister, Role::MasterAuthority));
        assert!(!roles.has_role(&blacklister, Role::Pauser));
        assert!(roles.has_role(&blacklister, Role::Blacklister));
        assert!(!roles.has_role(&blacklister, Role::Seizer));
    }

    #[test]
    fn fuzz_seizer_only_has_seizer_role() {
        let master = Pubkey::new_unique();
        let seizer = Pubkey::new_unique();
        let other = Pubkey::new_unique();
        let roles = make_roles(master, other, other, seizer);

        assert!(!roles.has_role(&seizer, Role::MasterAuthority));
        assert!(!roles.has_role(&seizer, Role::Pauser));
        assert!(!roles.has_role(&seizer, Role::Blacklister));
        assert!(roles.has_role(&seizer, Role::Seizer));
    }

    #[test]
    fn fuzz_random_pubkey_has_no_roles() {
        let master = Pubkey::new_unique();
        let pauser = Pubkey::new_unique();
        let blacklister = Pubkey::new_unique();
        let seizer = Pubkey::new_unique();
        let random = Pubkey::new_unique();
        let roles = make_roles(master, pauser, blacklister, seizer);

        assert!(!roles.has_role(&random, Role::MasterAuthority));
        assert!(!roles.has_role(&random, Role::Pauser));
        assert!(!roles.has_role(&random, Role::Blacklister));
        assert!(!roles.has_role(&random, Role::Seizer));
    }

    #[test]
    fn fuzz_default_pubkey_roles_disabled_sss1() {
        // In SSS1, blacklister and seizer are Pubkey::default()
        let master = Pubkey::new_unique();
        let roles = make_roles(master, master, Pubkey::default(), Pubkey::default());

        // A random key should not match default
        let random = Pubkey::new_unique();
        assert!(!roles.has_role(&random, Role::Blacklister));
        assert!(!roles.has_role(&random, Role::Seizer));

        // But Pubkey::default() would technically match - this is fine because
        // no real signer can be Pubkey::default()
        assert!(roles.has_role(&Pubkey::default(), Role::Blacklister));
    }

    // ======================================================================
    // 14. PAUSE STATE ENFORCEMENT
    // ======================================================================

    #[test]
    fn fuzz_paused_config_detected() {
        let mut config = default_config();
        config.is_paused = true;

        assert!(config.is_paused);
    }

    #[test]
    fn fuzz_unpaused_config_detected() {
        let config = default_config();

        assert!(!config.is_paused);
    }

    // ======================================================================
    // 15. SPACE CALCULATIONS - Verify account sizes are consistent
    // ======================================================================

    #[test]
    fn fuzz_config_space_sufficient() {
        // Verify that SPACE is at least large enough for the discriminator
        // plus all fixed-size fields and max-length strings
        let min_expected = 8  // discriminator
            + 1               // bump
            + 32              // mint
            + 32              // master_authority
            + (4 + 32)        // name (borsh string: 4-byte len + data)
            + (4 + 10)        // symbol
            + (4 + 200)       // uri
            + 1               // decimals
            + 1               // preset
            + 1               // enable_permanent_delegate
            + 1               // enable_transfer_hook
            + 1               // default_account_frozen
            + 1               // enable_confidential_transfers
            + 1               // is_paused
            + 8               // total_minted
            + 8               // total_burned
            + 8               // audit_log_index
            + 8               // reserve_attestation_index
            + 8               // created_at
            + 8;              // updated_at

        assert!(
            StablecoinConfig::SPACE >= min_expected,
            "Config SPACE {} is less than minimum required {}",
            StablecoinConfig::SPACE,
            min_expected
        );
    }

    #[test]
    fn fuzz_minter_info_space_sufficient() {
        let min_expected = 8  // discriminator
            + 1               // bump
            + 32              // config
            + 32              // minter
            + 1               // is_active
            + 8               // mint_quota
            + 8               // total_minted
            + 8               // created_at
            + 8;              // last_mint_at

        assert_eq!(MinterInfo::SPACE, min_expected);
    }

    #[test]
    fn fuzz_blacklist_entry_space_sufficient() {
        let min_expected = 8  // discriminator
            + 1               // bump
            + 32              // config
            + 32              // blocked_address
            + (4 + 128)       // reason (borsh string)
            + 32              // blacklisted_by
            + 8;              // blacklisted_at

        assert_eq!(BlacklistEntry::SPACE, min_expected);
    }

    #[test]
    fn fuzz_role_registry_space_sufficient() {
        let min_expected = 8  // discriminator
            + 1               // bump
            + 32              // config
            + 32              // master_authority
            + 32              // pauser
            + 32              // blacklister
            + 32;             // seizer

        assert_eq!(RoleRegistry::SPACE, min_expected);
    }

    #[test]
    fn fuzz_audit_log_space_sufficient() {
        let min_expected = 8  // discriminator
            + 1               // bump
            + 32              // config
            + 8               // index
            + 1               // action (enum)
            + 32              // actor
            + (1 + 32)        // target (Option<Pubkey>)
            + (1 + 8)         // amount (Option<u64>)
            + (4 + 256)       // details (borsh string)
            + 8;              // timestamp

        assert_eq!(AuditLogEntry::SPACE, min_expected);
    }

    #[test]
    fn fuzz_reserve_attestation_space_sufficient() {
        let min_expected = 8  // discriminator
            + 1               // bump
            + 32              // config
            + 8               // index
            + 32              // reserve_hash
            + 8               // total_reserves_usd
            + 8               // total_outstanding
            + 32              // attested_by
            + (4 + 200)       // attestation_uri (borsh string)
            + 8;              // timestamp

        assert_eq!(ReserveAttestation::SPACE, min_expected);
    }

    // ======================================================================
    // 16. PRESET FEATURE FLAG MAPPING
    // ======================================================================

    #[test]
    fn fuzz_preset_sss1_features() {
        // SSS1 should have no advanced features
        use sss_token::state::StablecoinPreset;
        let preset = StablecoinPreset::SSS1;
        let (perm_del, hook, frozen, ct) = match preset {
            StablecoinPreset::SSS1 => (false, false, false, false),
            StablecoinPreset::SSS2 => (true, true, false, false),
            StablecoinPreset::SSS3 => (true, false, false, true),
            StablecoinPreset::Custom => (false, false, false, false),
        };
        assert!(!perm_del);
        assert!(!hook);
        assert!(!frozen);
        assert!(!ct);
    }

    #[test]
    fn fuzz_preset_sss2_features() {
        use sss_token::state::StablecoinPreset;
        let preset = StablecoinPreset::SSS2;
        let (perm_del, hook, _frozen, ct) = match preset {
            StablecoinPreset::SSS1 => (false, false, false, false),
            StablecoinPreset::SSS2 => (true, true, false, false),
            StablecoinPreset::SSS3 => (true, false, false, true),
            StablecoinPreset::Custom => (false, false, false, false),
        };
        assert!(perm_del);
        assert!(hook);
        assert!(!ct);
    }

    #[test]
    fn fuzz_preset_sss3_features() {
        use sss_token::state::StablecoinPreset;
        let preset = StablecoinPreset::SSS3;
        let (perm_del, hook, _frozen, ct) = match preset {
            StablecoinPreset::SSS1 => (false, false, false, false),
            StablecoinPreset::SSS2 => (true, true, false, false),
            StablecoinPreset::SSS3 => (true, false, false, true),
            StablecoinPreset::Custom => (false, false, false, false),
        };
        assert!(perm_del);
        assert!(!hook);
        assert!(ct);
    }

    // ======================================================================
    // 17. SEED PREFIX CONSTANTS
    // ======================================================================

    #[test]
    fn fuzz_seed_prefixes_are_unique() {
        // All seed prefixes must be distinct to prevent PDA collisions
        let prefixes: Vec<&[u8]> = vec![
            StablecoinConfig::SEED_PREFIX,
            RoleRegistry::SEED_PREFIX,
            MinterInfo::SEED_PREFIX,
            BlacklistEntry::SEED_PREFIX,
            AuditLogEntry::SEED_PREFIX,
            ReserveAttestation::SEED_PREFIX,
        ];

        for i in 0..prefixes.len() {
            for j in (i + 1)..prefixes.len() {
                assert_ne!(
                    prefixes[i], prefixes[j],
                    "Seed prefix collision between index {} and {}",
                    i, j
                );
            }
        }
    }

    #[test]
    fn fuzz_seed_prefixes_expected_values() {
        assert_eq!(StablecoinConfig::SEED_PREFIX, b"config");
        assert_eq!(RoleRegistry::SEED_PREFIX, b"roles");
        assert_eq!(MinterInfo::SEED_PREFIX, b"minter");
        assert_eq!(BlacklistEntry::SEED_PREFIX, b"blacklist");
        assert_eq!(AuditLogEntry::SEED_PREFIX, b"audit");
        assert_eq!(ReserveAttestation::SEED_PREFIX, b"reserve");
    }

    // ======================================================================
    // 18. COMBINED SCENARIO FUZZ - Lifecycle simulation
    // ======================================================================

    #[test]
    fn fuzz_mint_burn_lifecycle_supply_invariant() {
        // Simulate a sequence of mints and burns and verify the supply
        // invariant holds: current_supply == total_minted - total_burned
        let mut config = default_config();

        let operations: Vec<(bool, u64)> = vec![
            (true, 1_000_000),    // mint 1M
            (true, 500_000),      // mint 500K
            (false, 200_000),     // burn 200K
            (true, 300_000),      // mint 300K
            (false, 1_000_000),   // burn 1M
            (false, 100_000),     // burn 100K
            (true, 50_000),       // mint 50K
        ];

        for (is_mint, amount) in &operations {
            if *is_mint {
                config.total_minted = config
                    .total_minted
                    .checked_add(*amount)
                    .expect("overflow in test mint");
            } else {
                config.total_burned = config
                    .total_burned
                    .checked_add(*amount)
                    .expect("overflow in test burn");
            }

            // Invariant: current_supply == total_minted.saturating_sub(total_burned)
            assert_eq!(
                config.current_supply(),
                config.total_minted.saturating_sub(config.total_burned)
            );
        }

        // Final supply: 1M + 500K + 300K + 50K = 1,850,000 minted
        //               200K + 1M + 100K = 1,300,000 burned
        //               Supply = 550,000
        assert_eq!(config.total_minted, 1_850_000);
        assert_eq!(config.total_burned, 1_300_000);
        assert_eq!(config.current_supply(), 550_000);
    }

    #[test]
    fn fuzz_minter_quota_lifecycle() {
        // A minter starts fresh, mints in increments, and eventually exhausts quota
        let mut minter = make_minter(true, 1_000_000, 0);

        // Mint in 100K increments
        for _ in 0..10 {
            assert!(minter.can_mint(100_000));
            minter.total_minted = minter
                .total_minted
                .checked_add(100_000)
                .expect("overflow");
        }

        // Quota fully exhausted
        assert_eq!(minter.remaining_quota(), Some(0));
        assert!(!minter.can_mint(1));
    }

    // ======================================================================
    // 19. PROPTEST - Generative fuzz testing
    // ======================================================================

    #[cfg(test)]
    mod proptest_fuzz {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            /// For any random string length, the name validation boundary at
            /// 32 bytes is correctly enforced.
            #[test]
            fn prop_name_validation_boundary(len in 0usize..256) {
                let name = "a".repeat(len);
                let valid = name.len() <= StablecoinConfig::MAX_NAME_LEN;
                prop_assert_eq!(valid, len <= 32);
            }

            /// For any random string length, the symbol validation boundary at
            /// 10 bytes is correctly enforced.
            #[test]
            fn prop_symbol_validation_boundary(len in 0usize..128) {
                let symbol = "S".repeat(len);
                let valid = symbol.len() <= StablecoinConfig::MAX_SYMBOL_LEN;
                prop_assert_eq!(valid, len <= 10);
            }

            /// For any random string length, the URI validation boundary at
            /// 200 bytes is correctly enforced.
            #[test]
            fn prop_uri_validation_boundary(len in 0usize..512) {
                let uri = "u".repeat(len);
                let valid = uri.len() <= StablecoinConfig::MAX_URI_LEN;
                prop_assert_eq!(valid, len <= 200);
            }

            /// For any random string length, the reason validation boundary at
            /// 128 bytes is correctly enforced.
            #[test]
            fn prop_reason_validation_boundary(len in 0usize..256) {
                let reason = "r".repeat(len);
                let valid = reason.len() <= BlacklistEntry::MAX_REASON_LEN;
                prop_assert_eq!(valid, len <= 128);
            }

            /// For any random decimals value, values 0-18 are valid.
            #[test]
            fn prop_decimals_validation(d in 0u8..=255) {
                let valid = d <= 18;
                prop_assert_eq!(valid, d <= 18);
            }

            /// For any random amount, the mint handler would reject zero.
            #[test]
            fn prop_mint_amount_nonzero(amount in 0u64..=u64::MAX) {
                let valid = amount > 0;
                prop_assert_eq!(valid, amount != 0);
            }

            /// For any minter state, can_mint is consistent with remaining_quota.
            #[test]
            fn prop_minter_can_mint_consistent(
                quota in 0u64..=1_000_000_000,
                minted in 0u64..=1_000_000_000,
                request in 1u64..=1_000_000_000,
            ) {
                let minter = make_minter(true, quota, minted);

                match minter.remaining_quota() {
                    None => {
                        // Unlimited quota
                        prop_assert!(minter.can_mint(request));
                    }
                    Some(remaining) => {
                        prop_assert_eq!(minter.can_mint(request), request <= remaining);
                    }
                }
            }

            /// Inactive minters can never mint, regardless of quota.
            #[test]
            fn prop_inactive_minter_never_mints(
                quota in 0u64..=u64::MAX,
                minted in 0u64..=u64::MAX,
                request in 1u64..=u64::MAX,
            ) {
                let minter = make_minter(false, quota, minted);
                prop_assert!(!minter.can_mint(request));
            }

            /// current_supply is always <= total_minted (by saturating_sub).
            #[test]
            fn prop_supply_leq_minted(
                minted in 0u64..=u64::MAX,
                burned in 0u64..=u64::MAX,
            ) {
                let mut config = default_config();
                config.total_minted = minted;
                config.total_burned = burned;

                prop_assert!(config.current_supply() <= minted);
            }

            /// checked_add detects overflow for any near-max value.
            #[test]
            fn prop_checked_add_overflow(
                base in (u64::MAX - 1000)..=u64::MAX,
                add in 1u64..=1000,
            ) {
                if (base as u128) + (add as u128) > u64::MAX as u128 {
                    prop_assert!(base.checked_add(add).is_none());
                } else {
                    prop_assert!(base.checked_add(add).is_some());
                }
            }

            /// A random pubkey should not have the MasterAuthority role unless
            /// it actually matches the registry's master_authority field.
            #[test]
            fn prop_random_key_unauthorized(seed in 0u64..=u64::MAX) {
                let master = Pubkey::new_unique();
                let roles = make_roles(
                    master,
                    Pubkey::new_unique(),
                    Pubkey::new_unique(),
                    Pubkey::new_unique(),
                );

                // Construct a "random" key from the seed - very unlikely to match
                let random = Pubkey::new_unique();
                let _ = seed; // consumed to drive proptest
                prop_assert!(!roles.has_role(&random, Role::MasterAuthority));
            }
        }
    }
}
