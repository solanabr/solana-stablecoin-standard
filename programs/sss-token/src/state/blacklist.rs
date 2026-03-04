use anchor_lang::prelude::*;

/// Max addresses per blacklist account. If you need more, create additional
/// pages keyed by index — but 256 covers most real-world compliance needs
/// without blowing account rent costs.
pub const MAX_BLACKLIST_ENTRIES: usize = 256;

/// SSS-2 only. Stores blacklisted wallet addresses.
/// PDA seeds: [b"sss_blacklist", config.key().as_ref()]
#[account]
pub struct Blacklist {
    pub bump: u8,
    pub config: Pubkey,
    pub count: u16,
    pub entries: Vec<Pubkey>,
    pub _reserved: [u8; 64],
}

impl Blacklist {
    // 8 discriminator + 1 bump + 32 config + 2 count + 4 vec_len + (32 * 256) entries + 64 reserved
    pub const LEN: usize = 8 + 1 + 32 + 2 + 4 + (32 * MAX_BLACKLIST_ENTRIES) + 64;

    pub fn contains(&self, addr: &Pubkey) -> bool {
        self.entries.iter().any(|e| e == addr)
    }

    pub fn add(&mut self, addr: Pubkey) -> bool {
        if self.contains(&addr) {
            return false;
        }
        if self.entries.len() >= MAX_BLACKLIST_ENTRIES {
            return false;
        }
        self.entries.push(addr);
        self.count = self.entries.len() as u16;
        true
    }

    pub fn remove(&mut self, addr: &Pubkey) -> bool {
        if let Some(pos) = self.entries.iter().position(|e| e == addr) {
            self.entries.swap_remove(pos);
            self.count = self.entries.len() as u16;
            true
        } else {
            false
        }
    }
}
