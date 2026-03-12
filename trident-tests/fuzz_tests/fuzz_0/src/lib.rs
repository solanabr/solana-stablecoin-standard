//! Trident fuzz tests for sss-core.
//!
//! Tests randomized sequences of: initialize, mint_tokens, burn_tokens,
//! freeze_account, thaw_account, add_to_blacklist, seize.
//!
//! Invariants checked:
//!   - Total supply never exceeds sum of minter caps
//!   - Seize always requires frozen account
//!   - Compliance instructions fail gracefully on SSS-1

use trident_client::fuzzing::*;

// This file is scaffolded — fill in with Trident-generated stubs after running:
//   trident fuzz run

pub mod accounts_snapshots;
pub mod fuzz_instructions;

use fuzz_instructions::FuzzInstruction;

struct SssFuzz;

impl FuzzDataBuilder<FuzzInstruction> for SssFuzz {}

fn main() {
    loop {
        fuzz_trident!(fuzz_ix: FuzzInstruction, |fuzz_data: SssFuzz| {});
    }
}
