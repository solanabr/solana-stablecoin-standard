#![allow(dead_code)]

#[derive(Clone, Copy, Debug, Default)]
pub struct QuotaState {
    pub window_start_ts: i64,
    pub window_seconds: i64,
    pub minted_in_window: u64,
    pub quota_amount: u64,
}

impl QuotaState {
    pub fn try_mint(&mut self, now: i64, amount: u64) -> bool {
        if now.saturating_sub(self.window_start_ts) >= self.window_seconds {
            self.window_start_ts = now;
            self.minted_in_window = 0;
        }

        match self.minted_in_window.checked_add(amount) {
            Some(next) if next <= self.quota_amount => {
                self.minted_in_window = next;
                true
            }
            _ => false,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Pauser,
    Burner,
    Blacklister,
    Seizer,
}

#[derive(Clone, Copy, Debug)]
pub struct RoleState {
    pub master: u64,
    pub pauser: u64,
    pub burner: u64,
    pub blacklister: u64,
    pub seizer: u64,
}

impl Default for RoleState {
    fn default() -> Self {
        Self {
            master: 1,
            pauser: 1,
            burner: 1,
            blacklister: 1,
            seizer: 1,
        }
    }
}

impl RoleState {
    pub fn transfer_master(&mut self, signer: u64, new_master: u64) -> bool {
        if signer != self.master {
            return false;
        }
        self.master = new_master;
        true
    }

    pub fn set_role(&mut self, signer: u64, role: Role, new_value: u64) -> bool {
        if signer != self.master {
            return false;
        }

        match role {
            Role::Pauser => self.pauser = new_value,
            Role::Burner => self.burner = new_value,
            Role::Blacklister => self.blacklister = new_value,
            Role::Seizer => self.seizer = new_value,
        }
        true
    }
}
