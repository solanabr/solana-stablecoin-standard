# Testing Strategy

SSS testing validates both the Execution Plane correctness and invariant enforcement on the Policy Plane.

## Unit & Integration Tests (Anchor)
Test constraints using `ts-mocha` against the local test validator.
- Run `anchor test` to invoke test suites ensuring:
  - Unauthorized roles are rejected.
  - Quotas cannot be exceeded by colluding Minters.
  - Seizures fail gracefully when `enable_permanent_delegate` is false.

## Property & Fuzz Testing 
It is recommended to run Trident fuzzing tests to ensure that invariant #1 (Supply Conservation) cannot be desynchronized even with arbitrary instruction nesting.

## Continuous Integration
Requires Node 18+ and Rust 1.70.0+ along with a local instance of the Solana Test Validator.
