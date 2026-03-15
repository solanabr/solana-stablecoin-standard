# Fuzz Testing (Trident)

This directory contains fuzz test stubs for the Solana Stablecoin Standard.

## Overview

The stablecoin program should be fuzzed to discover edge cases in:
- **Role management**: Rapid grant/revoke cycles, concurrent role changes
- **Token operations**: Large amounts near u64 overflow, mint/burn race conditions
- **Blacklist operations**: Add/remove cycles, seize with various owner configurations
- **Pause/unpause**: Operations submitted during state transitions
- **Quota enforcement**: Boundary conditions near quota limits

## Setup

Trident requires the Solana program to be compiled to BPF and requires additional
configuration. Install Trident:

```bash
cargo install trident-cli
trident init
```

## Fuzz Targets

### 1. Role Fuzzer (`fuzz_roles.rs`)
Tests arbitrary sequences of grant/revoke operations to ensure:
- Role bitmask always reflects correct state
- init_if_needed never double-initializes
- Unauthorized callers always fail

### 2. Token Ops Fuzzer (`fuzz_token_ops.rs`)
Tests arbitrary mint/burn sequences to ensure:
- total_minted / total_burned never overflow
- Pause state always enforced
- Quota enforcement correct at boundaries

### 3. Compliance Fuzzer (`fuzz_compliance.rs`)
Tests blacklist + seize sequences to ensure:
- Only correct owners can be seized from
- Double-blacklist always rejected
- Removed entries cannot be used for seize

## Running (once Trident is configured)

```bash
trident fuzz run fuzz_roles
trident fuzz run fuzz_token_ops
trident fuzz run fuzz_compliance
```
