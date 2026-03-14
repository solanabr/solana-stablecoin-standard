#![allow(dead_code)]

#[derive(Clone, Copy, Debug, Default)]
pub struct ComplianceTracker {
    pub compliance_enabled: bool,
    pub seize_requires_blacklist: bool,
    pub blacklisted: bool,
    pub paused: bool,
    pub balance: u64,
    pub treasury_balance: u64,
}

impl ComplianceTracker {
    pub fn blacklist_add(&mut self) -> bool {
        if !self.compliance_enabled {
            return false;
        }
        self.blacklisted = true;
        true
    }

    pub fn blacklist_remove(&mut self) -> bool {
        if !self.compliance_enabled {
            return false;
        }
        self.blacklisted = false;
        true
    }

    pub fn seize(&mut self, amount: u64) -> bool {
        if !self.compliance_enabled {
            return false;
        }
        if self.seize_requires_blacklist && !self.blacklisted {
            return false;
        }
        if self.balance < amount {
            return false;
        }

        self.balance -= amount;
        self.treasury_balance = self.treasury_balance.saturating_add(amount);
        true
    }
}
