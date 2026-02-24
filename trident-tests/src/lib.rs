//! Property-based fuzz tests for SSS programs.
//!
//! These tests use `proptest` to generate random instruction sequences and
//! verify that critical invariants hold regardless of input:
//!
//! 1. **Role escalation**: Random grant/revoke sequences cannot produce
//!    unauthorized role assignments.
//! 2. **Supply cap overflow**: Random mint/burn sequences cannot exceed
//!    the configured supply cap or cause arithmetic overflow.
//! 3. **Pause bypass**: Operations always fail when the protocol is paused.
//! 4. **Arithmetic overflow**: Large amounts cannot cause u64 overflow in
//!    total_minted or total_burned counters.
//! 5. **Blacklist invariants**: Blacklisted addresses remain blacklisted
//!    until explicitly removed.
//!
//! For on-chain fuzz testing with Trident (honggfuzz), see `trident-tests/fuzz_0/`.

mod invariants;
mod supply_cap;
mod role_escalation;
mod pause_bypass;
mod arithmetic;
