use anchor_lang::prelude::*;

declare_program!(sss);

pub use sss::client::accounts;
pub use sss::client::args;
pub use sss::ID as PROGRAM_ID;

/// Event authority PDA for emit_cpi!  Seeds: [b"__event_authority"]
pub fn event_authority() -> Pubkey {
    Pubkey::find_program_address(&[b"__event_authority"], &PROGRAM_ID).0
}
