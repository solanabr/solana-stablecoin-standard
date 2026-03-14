# Trident Fuzz Harness

This directory contains the Trident fuzz harness for the Solana Stablecoin Standard.

Included targets:

- `fuzz_0`: quota window arithmetic and role-rotation invariants
- `fuzz_1`: compliance gating and seize-path invariants

Files:

- `Trident.toml`: Trident program mapping
- `fuzz_0/`: quota and RBAC fuzz target
- `fuzz_1/`: compliance fuzz target

Useful commands:

```bash
cargo test --manifest-path trident-tests/Cargo.toml
cd trident-tests
cargo run --bin fuzz_0
cargo run --bin fuzz_1
```

Note:

- running from `trident-tests/` is important so Trident can resolve `Trident.toml`
- these targets currently fuzz protocol invariants and flow sequencing rather than full on-chain instruction execution
