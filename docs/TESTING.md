# Testing

## Run All Tests (copy-paste)

From repo root after `pnpm install`:

```bash
# 1. SDK unit tests (no validator)
pnpm test:sdk

# 2. Backend tests (no validator)
pnpm -C backend test

# 3. Integration tests (starts validator, deploys, runs ~38 tests)
anchor build && pnpm test:integration

# 4. Trident fuzz tests (requires: cargo install trident-cli)
cd trident-tests && trident fuzz run fuzz_0 && trident fuzz run fuzz_1
```

**Full suite** (SDK + backend + integration + fuzz):

```bash
pnpm install
pnpm test:sdk
pnpm -C backend test
anchor build && pnpm test:integration
cd trident-tests && trident fuzz run fuzz_0 && trident fuzz run fuzz_1
```

## Test Layers

- **SDK unit tests** — `sdk/core`: PDA derivation, presets, config normalization, error parsing, compliance gating. No chain. Run: `pnpm test:sdk`.
- **Backend tests** — `backend/__tests__`: API, compliance, validation. Run: `pnpm -C backend test`.
- **Integration tests** — Repo root `tests/`: Full lifecycle with local validator. Run: `anchor build && pnpm test:integration`. Includes `sss1-lifecycle.test.ts`, `sss2-compliance.test.ts`, `roles-and-minters.test.ts`, `edge-cases.test.ts`, `authority-transfer.test.ts`, and `sss-sdk.test.ts`.
- **CLI smoke test** — Builds `packages/cli` and runs `--help`. Run: `pnpm test:cli`.
- **Fuzz tests (Trident)** — Instruction sequences and invariants for the sss-1 program. See [Fuzz tests](#fuzz-tests) below.

## Running Tests

```bash
# SDK unit tests only (no validator)
pnpm test:sdk

# Backend tests only (no validator)
pnpm -C backend test

# Integration tests (starts validator, deploys programs, runs all test files)
anchor build && pnpm test:integration

# CLI smoke test (build + --help; no RPC)
pnpm test:cli

# Trident fuzz (from trident-tests/)
cd trident-tests && trident fuzz run fuzz_0 && trident fuzz run fuzz_1
```

## Fuzz tests

Trident is used to fuzz the SSS token program (sss-1) with random instruction data and sequences.

### About Trident

**Trident** is an open-source, Rust-based fuzzing framework for Solana programs written in Anchor. It was created by [Ackee Blockchain](https://ackee.xyz) and is supported by the Solana Foundation. Unlike black-box fuzzers that send random bytes, Trident uses **manually guided fuzzing (MGF)**:

- **Instruction sequences** — You define flows (e.g. init → mint → burn) and Trident runs many variations, reordering and combining instructions to find sequence-dependent bugs.
- **Instruction parameters** — The fuzzer varies instruction data (amounts, account indices, flags) within constraints you specify, improving coverage of edge cases.
- **Account state** — Different account states (e.g. paused vs unpaused, blacklisted vs not) are explored so role checks, pause, and compliance logic get stressed.

Trident parses your Anchor IDL to generate account and instruction types, so you spend less time on boilerplate and more on defining **invariants** (properties that must always hold) and **flows** (instruction sequences to fuzz). It runs at high throughput (thousands of transactions per second in its SVM environment) and supports regression testing and optional code coverage.

For SSS, Trident helps catch overflow bugs, role/authorization mistakes, and invariant violations (e.g. supply ≠ minted − burned) before they reach production.

**Docs:** [Trident documentation](https://ackee.xyz/trident/docs/latest/) · [Fuzz instructions](https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/) · [Invariants](https://ackee.xyz/trident/docs/latest/trident-advanced/invariants-assertions/)

### Invariants to assert (implement in your flows)

- **Supply:** Total supply = total minted − total burned (from stablecoin state).
- **Pause:** When paused, `mint_tokens` and `burn_tokens` must fail.
- **Blacklist (SSS-2):** Transfers involving a blacklisted address must be rejected by the transfer hook.
- **Roles:** Only master can update roles; only minters can mint (within quota); only blacklister can add/remove blacklist; only seizer can seize.
- **Overflow:** Mint/burn amounts must not overflow when scaled by decimals.

### Negative flows (must-fail)

The fuzz harness asserts that certain transactions fail as expected:

- **flow3 (role escalation):** A keypair that is not the stablecoin authority signs `UpdateRoles`; the tx must fail (constraint or Unauthorized).
- **flow4 (pause bypass):** After `Pause`, a `MintTokens` tx must fail (e.g. Paused or invalid recipient).
- **flow5 (arithmetic overflow):** Mint once, then mint `u64::MAX`; the second mint must fail (e.g. MathOverflow or token error).

### Install and run

1. **Install Trident CLI** (and optionally Honggfuzz for older Trident versions):

   ```bash
   cargo install trident-cli
   ```

   See [Trident installation](https://ackee.xyz/trident/docs/latest/basics/installation/) for supported Anchor/Solana/Rust versions.

2. **Initialize fuzz tests** (from repo root). This creates or updates the `trident-tests` directory:

   ```bash
   trident init
   ```

   If Trident creates a new directory, copy `trident-tests/Trident.toml` from this repo into it so the SSS program is used (address `47TNsKC1iJvLTKYRMbfYjrod4a56YE1f4qv73hZkdWUZ`, program `../target/deploy/sss_1.so`).

3. **Build the program:**

   ```bash
   anchor build
   ```

4. **Run a fuzz target** (from `trident-tests`):

   ```bash
   cd trident-tests
   trident fuzz run fuzz_0
   ```

   Optional: `trident fuzz run fuzz_0 12345` uses a fixed seed for reproducibility. Enable logging: `TRIDENT_LOG=1 trident fuzz run fuzz_0`.

5. **Implement flows** in the generated `test_fuzz.rs`: build transactions for `initialize_stablecoin`, `mint_tokens`, `burn_tokens`, and add `check()` / invariant assertions for the invariants above. See [Trident docs](https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/) and [trident-tests/README.md](../trident-tests/README.md).

## Integration Test Files

Integration and SDK unit tests total 100+ across the repo.

- **sss1-lifecycle.test.ts** — SSS-1 full lifecycle.
- **sss2-compliance.test.ts** — SSS-2 compliance (transfer hook, blacklist, seize).
- **sss-token.test.ts** — SSS-1: initialize, roles, mint, burn, pause, freeze/thaw, transfer authority, error cases, quota/supply, authority transfer, roles isolation.
- **sss-transfer-hook.test.ts** — SSS-2: initialize with hook, roles, minter quota, extra-account-metas, blacklist, seize, error cases.
- **roles-and-minters.test.ts** — Roles and minter quotas.
- **edge-cases.test.ts** — Edge cases.
- **authority-transfer.test.ts** — Authority transfer.
- **sss-sdk.test.ts** — SDK: create stablecoin, load with `SolanaStablecoin.load`, getState, getTotalSupply, mint via SDK.

## Preset / Config Tests

Unit tests in `sdk/core/tests/stablecoin.test.ts` assert that:

- `Presets.SSS_1` and `Presets.SSS_2` yield the correct three booleans.
- `normalizeInitializeParams` with custom extensions or preset override produces the expected init params.

## Unit tests for program instructions

Rust unit tests in `programs/sss-1` (`cargo test -p sss-1`) cover:

- **Constants** — PDA seeds and validation limits (name, symbol, URI, reason length).
- **RoleFlags** — Serialization roundtrip and length.
- **StablecoinState** — `is_sss2()` for SSS-1 vs SSS-2 config.
- **StablecoinError** — All error variants exist and are usable.

Full instruction execution (success and constraint-failure paths) is covered by the TypeScript integration tests in `tests/sss-token.test.ts` and `tests/sss-transfer-hook.test.ts`.

## Submission checklist

For PR submission or local verification, see the [Verification (submission checklist)](../README.md#verification-submission-checklist) section in the root README. In short:

1. `anchor build && pnpm run build:sdk && pnpm run test:sdk && anchor test`
2. `docker compose up` and `curl http://localhost:3000/health`
3. (Optional) Run integration tests on devnet and refresh [DEVNET.md](DEVNET.md) example links.

## Validate CI workflow before push

To catch workflow YAML errors locally (same as GitHub):

```bash
bash <(curl -sSL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash) latest .
./actionlint -shellcheck= -pyflakes= .github/workflows/ci.yml
```

Or install [actionlint](https://github.com/rhysd/actionlint) and run `actionlint .github/workflows/ci.yml`. CI also runs a lint job.

## CI

Ensure `anchor build` runs before SDK build (IDL is generated by Anchor). Order: `anchor build` → `npm run build:sdk` → `npm run test:sdk` → `anchor test`.
