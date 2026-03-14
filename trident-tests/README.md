# Invariant-Based Fuzz Tests

Property-based testing that validates 8 core state machine invariants across 50,000+ randomized operations.

## Invariants Checked

1. **Supply conservation**: `total_minted >= total_burned` (always)
2. **Net supply consistency**: `total_minted - total_burned == on-chain supply`
3. **Role consistency**: grant + revoke are inverse operations
4. **Blacklist enforcement**: blacklisted addresses cannot transfer
5. **Quota enforcement**: minter cannot exceed `quota_limit`
6. **Pause enforcement**: no mint/burn while paused
7. **Seize conservation**: seize doesn't change net supply (atomic burn+mint)
8. **Authority safety**: two-step transfer requires accept

## Running

```bash
# Run the invariant test suite (50,000 operations)
cargo run --bin fuzz_0

# For on-validator fuzzing with Trident
trident fuzz run fuzz_0
```

## Test Strategy

The fuzzer uses a state-machine model (`StablecoinTracker`) that mirrors on-chain state transitions. After each operation, all 8 invariants are verified against the model. Operations include:

- Deterministic sequences (known edge cases)
- Randomized operation chains (10 seeds x 5,000 operations each)
- Edge cases: u64 overflow, zero amounts, quota exhaustion
