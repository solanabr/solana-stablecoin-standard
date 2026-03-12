use anchor_lang::prelude::*;

/// Per-minter record storing quota and usage.
#[account]
pub struct MinterRecord {
    pub mint: Pubkey,
    pub minter: Pubkey,
    /// None means no cap (unlimited within global rules).
    pub cap: Option<u64>,
    /// How much has already been minted by this minter.
    pub minted: u64,
    pub active: bool,
    pub bump: u8,
}

impl MinterRecord {
    pub const SPACE: usize = 8  // discriminator
        + 32 // mint
        + 32 // minter
        + 1 + 8 // cap Option<u64>
        + 8  // minted
        + 1  // active
        + 1; // bump

    pub fn remaining_cap(&self) -> Option<u64> {
        self.cap.map(|cap| cap.saturating_sub(self.minted))
    }
}
