use rand::{rngs::StdRng, Rng, SeedableRng};
use trident_fuzz::fuzzing::*;

mod fuzz_accounts;
mod types;

use fuzz_accounts::AccountAddresses;
use types::ComplianceTracker;

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: AccountAddresses,
    tracker: ComplianceTracker,
    rng: StdRng,
}

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: AccountAddresses::default(),
            tracker: ComplianceTracker::default(),
            rng: StdRng::seed_from_u64(11),
        }
    }

    #[init]
    fn start(&mut self) {
        self.tracker = ComplianceTracker {
            compliance_enabled: self.rng.gen_bool(0.5),
            seize_requires_blacklist: true,
            blacklisted: false,
            paused: false,
            balance: self.rng.gen_range(1_000u64..1_000_000u64),
            treasury_balance: 0,
        };
    }

    #[flow]
    fn flow_blacklist_toggle(&mut self) {
        let before = self.tracker.blacklisted;
        let changed = if before {
            self.tracker.blacklist_remove()
        } else {
            self.tracker.blacklist_add()
        };

        if self.tracker.compliance_enabled {
            assert!(changed);
            assert_ne!(self.tracker.blacklisted, before);
        } else {
            assert!(!changed);
            assert_eq!(self.tracker.blacklisted, before);
        }
    }

    #[flow]
    fn flow_seize_attempt(&mut self) {
        let amount = self.rng.gen_range(1u64..50_000u64);
        let balance_before = self.tracker.balance;
        let treasury_before = self.tracker.treasury_balance;
        let succeeded = self.tracker.seize(amount);

        if succeeded {
            assert!(self.tracker.compliance_enabled);
            assert!(balance_before >= amount);
            assert!(self.tracker.blacklisted || !self.tracker.seize_requires_blacklist);
            assert_eq!(self.tracker.balance, balance_before - amount);
            assert_eq!(self.tracker.treasury_balance, treasury_before + amount);
        } else {
            assert_eq!(self.tracker.balance, balance_before);
            assert_eq!(self.tracker.treasury_balance, treasury_before);
        }
    }
}

fn main() {
    FuzzTest::fuzz(256, 32);
}
