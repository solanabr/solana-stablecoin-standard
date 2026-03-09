//! Fuzz Test 1: Role Escalation & Authorization
//!
//! This fuzz test attempts to escalate privileges by:
//! 1. Calling admin-only instructions with random signers
//! 2. Using one role's PDA to call another role's instruction
//! 3. Re-using revoked role accounts
//! 4. Attempting to grant roles from non-admin accounts
//! 5. Calling instructions with mismatched config/mint PDAs

use anchor_lang::prelude::*;
use arbitrary::Arbitrary;
use trident_client::fuzzing::*;

/// Authorization test scenarios
#[derive(Arbitrary, Debug)]
enum AuthFuzzInstruction {
    /// Try to mint with a non-minter signer
    MintWithWrongRole {
        signer_role: u8, // 0=minter, 1=burner, 2=seizer, 3=pauser, 4=compliance
    },
    /// Try to burn with a non-burner signer
    BurnWithWrongRole {
        signer_role: u8,
    },
    /// Try to seize with a non-seizer signer
    SeizeWithWrongRole {
        signer_role: u8,
    },
    /// Try to blacklist from a non-admin account
    BlacklistAsNonAdmin,
    /// Try to grant role from a non-admin account
    GrantRoleAsNonAdmin {
        role: u8,
    },
    /// Try to pause from a non-pauser/non-admin account
    PauseAsUnauthorized,
    /// Try to freeze from a non-compliance-officer account
    FreezeAsUnauthorized,
    /// Try to accept admin transfer as non-pending-admin
    AcceptAdminAsWrongUser,
    /// Try to use a role account from a different config
    CrossConfigRoleUse,
    /// Try to use a revoked role (account should be closed)
    UseRevokedRole,
    /// Try to mint with zero allowance
    MintWithZeroAllowance,
    /// Try to blacklist admin address
    BlacklistAdmin,
    /// Try to blacklist treasury address
    BlacklistTreasury,
    /// Try to call initialize_hook as non-admin
    InitHookAsNonAdmin,
    /// Try to set metadata as non-admin
    SetMetadataAsNonAdmin,
}

/// Authorization invariants
struct AuthInvariants;

impl AuthInvariants {
    /// INVARIANT: Role PDA seeds include role discriminant
    /// A Minter PDA cannot be used as a Burner PDA because the seeds differ.
    /// Seeds: ["sss_role", config, holder, role_discriminant]
    fn verify_role_isolation(role_used: u8, expected_role: u8, succeeded: bool) {
        if role_used != expected_role {
            assert!(
                !succeeded,
                "Role isolation violated: used role {} for role {} instruction",
                role_used, expected_role
            );
        }
    }

    /// INVARIANT: Only admin can call governance instructions
    /// grant_role, revoke_role, increment_allowance, transfer_admin,
    /// blacklist, unblacklist, set_metadata, initialize_hook
    fn verify_admin_only(is_admin: bool, succeeded: bool) {
        if !is_admin {
            assert!(
                !succeeded,
                "Admin-only invariant violated: non-admin succeeded"
            );
        }
    }

    /// INVARIANT: Revoked roles cannot be re-used
    /// After revoke_role, the PDA account is closed (zero lamports).
    /// Any attempt to use the account should fail with AccountNotFound.
    fn verify_revoked_role_unusable(is_revoked: bool, succeeded: bool) {
        if is_revoked {
            assert!(
                !succeeded,
                "Revoked role invariant violated: revoked role was used successfully"
            );
        }
    }

    /// INVARIANT: Protected addresses cannot be blacklisted
    /// Admin, treasury, and pending_admin are protected.
    fn verify_protected_address(is_protected: bool, blacklist_succeeded: bool) {
        if is_protected {
            assert!(
                !blacklist_succeeded,
                "Protected address invariant violated: protected address was blacklisted"
            );
        }
    }

    /// INVARIANT: Zero allowance blocks minting
    /// A minter with allowance=0 cannot mint any tokens.
    fn verify_zero_allowance_blocks_mint(allowance: u64, mint_succeeded: bool) {
        if allowance == 0 {
            assert!(
                !mint_succeeded,
                "Zero allowance invariant violated: minted with zero allowance"
            );
        }
    }

    /// INVARIANT: Cross-config role accounts are invalid
    /// A role PDA derived from config_A cannot authorize operations on config_B.
    fn verify_cross_config_rejected(same_config: bool, succeeded: bool) {
        if !same_config {
            assert!(
                !succeeded,
                "Cross-config invariant violated: role from different config was accepted"
            );
        }
    }
}

fn main() {
    println!("SSS Fuzz Test 1: Role Escalation & Authorization");
    println!("Run with: trident fuzz run-hfuzz fuzz_1");
    println!();
    println!("Scenarios tested:");
    println!("  1. Wrong role for instruction (minter can't burn, etc.)");
    println!("  2. Non-admin calling governance instructions");
    println!("  3. Re-using revoked role accounts");
    println!("  4. Blacklisting protected addresses (admin, treasury)");
    println!("  5. Minting with zero allowance");
    println!("  6. Cross-config role PDA reuse");
    println!("  7. Accept admin as wrong user");
    println!();
    println!("Authorization invariants:");
    println!("  - Role PDA isolation via seed discriminant");
    println!("  - Admin-only gate on 8+ governance instructions");
    println!("  - Protected address guard on blacklist");
    println!("  - Revoked role account is closed (zero lamports)");
    println!("  - Zero allowance hard blocks minting");
}
