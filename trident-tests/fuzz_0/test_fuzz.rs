use rand::{rngs::StdRng, Rng, SeedableRng};
use trident_fuzz::fuzzing::*;

mod fuzz_accounts;
mod types;

use fuzz_accounts::AccountAddresses;
use types::{QuotaState, Role, RoleState};

#[derive(Default)]
struct Tracker {
    quota: QuotaState,
    roles: RoleState,
    accepted_mints: u64,
    rejected_mints: u64,
}

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: AccountAddresses,
    tracker: Tracker,
    rng: StdRng,
}

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: AccountAddresses::default(),
            tracker: Tracker::default(),
            rng: StdRng::seed_from_u64(7),
        }
    }

    #[init]
    fn start(&mut self) {
        let quota_amount = self.rng.gen_range(1_000u64..100_000u64);
        let window_seconds = self.rng.gen_range(1i64..86_400i64);
        self.tracker = Tracker {
            quota: QuotaState {
                window_start_ts: 0,
                window_seconds,
                minted_in_window: 0,
                quota_amount,
            },
            roles: RoleState::default(),
            accepted_mints: 0,
            rejected_mints: 0,
        };
    }

    #[flow]
    fn flow_mint_attempt(&mut self) {
        let now = self.rng.gen_range(-1_000i64..100_000i64);
        let amount = self.rng.gen_range(0u64..150_000u64);
        let accepted = self.tracker.quota.try_mint(now, amount);

        if accepted {
            self.tracker.accepted_mints = self.tracker.accepted_mints.saturating_add(1);
        } else {
            self.tracker.rejected_mints = self.tracker.rejected_mints.saturating_add(1);
        }

        assert!(self.tracker.quota.minted_in_window <= self.tracker.quota.quota_amount);
    }

    #[flow]
    fn flow_master_rotation(&mut self) {
        let old_master = self.tracker.roles.master;
        let new_master = self.rng.gen_range(2u64..10_000u64);
        assert!(self.tracker.roles.transfer_master(old_master, new_master));
        assert!(!self.tracker.roles.set_role(old_master, Role::Pauser, old_master));
        assert!(self.tracker.roles.set_role(new_master, Role::Seizer, new_master));
        assert_eq!(self.tracker.roles.seizer, new_master);
    }

    #[flow]
    fn flow_unauthorized_role_change(&mut self) {
        let outsider = self.rng.gen_range(20_000u64..30_000u64);
        let new_value = self.rng.gen_range(30_001u64..40_000u64);
        let before = self.tracker.roles.burner;
        assert!(!self.tracker.roles.set_role(outsider, Role::Burner, new_value));
        assert_eq!(self.tracker.roles.burner, before);
    }

    #[flow]
    fn flow_authorized_role_change(&mut self) {
        let master = self.tracker.roles.master;
        let new_value = self.rng.gen_range(40_001u64..50_000u64);
        assert!(self.tracker.roles.set_role(master, Role::Blacklister, new_value));
        assert_eq!(self.tracker.roles.blacklister, new_value);
    }
}

fn main() {
    FuzzTest::fuzz(256, 32);
}
