// Trident fuzz test crate root.
// The actual fuzz tests are structured in the fuzz_tests module and run via `cargo test`.

#[path = "../fuzz_tests/fuzz_0/mod.rs"]
pub mod fuzz_0;

#[path = "../fuzz_tests/fuzz_1/mod.rs"]
pub mod fuzz_1;
