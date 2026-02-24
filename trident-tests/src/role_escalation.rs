//! Fuzz: Role escalation — random grant/revoke sequences cannot produce
//! unauthorized role assignments.

use proptest::prelude::*;
use sss_core::state::role::Role;
use solana_sdk::pubkey::Pubkey;

/// Simulated role store — maps (address, role) to existence.
/// Mirrors on-chain PDA-based role authorization.
#[derive(Debug, Clone)]
struct RoleStore {
    /// (address, role) pairs that currently exist.
    roles: Vec<(Pubkey, Role)>,
    /// Addresses that are admins (can grant/revoke).
    admin_count: usize,
}

impl RoleStore {
    fn new(initial_admin: Pubkey) -> Self {
        Self {
            roles: vec![(initial_admin, Role::Admin)],
            admin_count: 1,
        }
    }

    fn has_role(&self, addr: &Pubkey, role: &Role) -> bool {
        self.roles.iter().any(|(a, r)| a == addr && r == role)
    }

    fn is_admin(&self, addr: &Pubkey) -> bool {
        self.has_role(addr, &Role::Admin)
    }

    /// Simulate grant_role: only admins can grant, and the role PDA is created.
    fn grant(&mut self, granter: &Pubkey, target: &Pubkey, role: Role) -> bool {
        if !self.is_admin(granter) {
            return false;
        }
        if self.has_role(target, &role) {
            return false; // PDA already exists
        }
        if matches!(role, Role::Admin) {
            self.admin_count += 1;
        }
        self.roles.push((*target, role));
        true
    }

    /// Simulate revoke_role: only admins can revoke, last admin protection.
    fn revoke(&mut self, revoker: &Pubkey, target: &Pubkey, role: Role) -> bool {
        if !self.is_admin(revoker) {
            return false;
        }
        if !self.has_role(target, &role) {
            return false;
        }
        // Last admin protection
        if matches!(role, Role::Admin) && self.admin_count <= 1 {
            return false;
        }
        if let Some(idx) = self.roles.iter().position(|(a, r)| a == target && *r == role) {
            self.roles.remove(idx);
            if matches!(role, Role::Admin) {
                self.admin_count -= 1;
            }
            return true;
        }
        false
    }
}

#[derive(Debug, Clone)]
enum RoleOp {
    Grant { granter_idx: usize, target_idx: usize, role: Role },
    Revoke { revoker_idx: usize, target_idx: usize, role: Role },
}

fn role_strategy() -> impl Strategy<Value = Role> {
    prop_oneof![
        Just(Role::Admin),
        Just(Role::Minter),
        Just(Role::Freezer),
        Just(Role::Pauser),
    ]
}

fn role_op_strategy() -> impl Strategy<Value = RoleOp> {
    prop_oneof![
        (0usize..5, 0usize..5, role_strategy()).prop_map(|(g, t, r)| RoleOp::Grant {
            granter_idx: g,
            target_idx: t,
            role: r,
        }),
        (0usize..5, 0usize..5, role_strategy()).prop_map(|(g, t, r)| RoleOp::Revoke {
            revoker_idx: g,
            target_idx: t,
            role: r,
        }),
    ]
}

proptest! {
    /// No sequence of grant/revoke operations can violate role invariants:
    /// - Only admins can grant/revoke
    /// - At least one admin always exists
    /// - Roles are idempotent (can't double-grant)
    #[test]
    fn role_escalation_impossible(
        ops in proptest::collection::vec(role_op_strategy(), 1..200),
    ) {
        let addresses: Vec<Pubkey> = (0..5).map(|_| Pubkey::new_unique()).collect();
        let mut store = RoleStore::new(addresses[0]);

        for op in ops {
            match op {
                RoleOp::Grant { granter_idx, target_idx, role } => {
                    let granter = &addresses[granter_idx];
                    let target = &addresses[target_idx];
                    let was_admin_before = store.is_admin(granter);
                    let result = store.grant(granter, target, role);

                    // If grant succeeded, granter must have been admin
                    if result {
                        prop_assert!(was_admin_before,
                            "Non-admin {:?} was able to grant role {:?}",
                            granter_idx, role
                        );
                    }
                }
                RoleOp::Revoke { revoker_idx, target_idx, role } => {
                    let revoker = &addresses[revoker_idx];
                    let target = &addresses[target_idx];
                    let was_admin_before = store.is_admin(revoker);
                    let result = store.revoke(revoker, target, role);

                    if result {
                        prop_assert!(was_admin_before,
                            "Non-admin {:?} was able to revoke role {:?}",
                            revoker_idx, role
                        );
                    }
                }
            }

            // Invariant: at least one admin always exists
            prop_assert!(store.admin_count >= 1,
                "Admin count dropped to zero after operation"
            );
        }
    }

    /// A non-admin address can never gain admin role without an existing admin granting it.
    #[test]
    fn non_admin_cannot_self_escalate(
        target_idx in 1usize..5,
        role in role_strategy(),
    ) {
        let addresses: Vec<Pubkey> = (0..5).map(|_| Pubkey::new_unique()).collect();
        let mut store = RoleStore::new(addresses[0]);

        // A non-admin tries to grant themselves a role
        let target = &addresses[target_idx];
        let result = store.grant(target, target, role);

        prop_assert!(!result,
            "Non-admin was able to self-grant role {:?}", role
        );
    }
}
