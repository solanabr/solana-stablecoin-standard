# Testing Guide

## Overview

The project includes comprehensive test suites covering SSS-1, SSS-2, SSS-3, SDK, and fuzz testing.

## Running Tests

### Full Test Suite

```bash
# Run all tests via Anchor (starts local validator)
anchor test

# Or using npm
npm test
```

### Individual Test Suites

```bash
# SSS-1 tests only
npx ts-mocha -p ./tsconfig.json tests/sss-1.test.ts --timeout 120000

# SSS-2 tests only
npx ts-mocha -p ./tsconfig.json tests/sss-2.test.ts --timeout 120000

# SSS-2 Transfer Hook tests
npx ts-mocha -p ./tsconfig.json tests/sss2_hook.ts --timeout 120000

# Fuzz tests
npx ts-mocha -p ./tsconfig.json tests/fuzz.test.ts --timeout 300000

# Privacy tests
npx ts-mocha -p ./tsconfig.json tests/privacy.test.ts --timeout 120000
```

### SDK Tests

```bash
cd sdk
npm test
```

### Run Script

```bash
# Use the test runner script
chmod +x tests/run-tests.sh
./tests/run-tests.sh
```

## Test Suites

### SSS-1: Basic RBAC Stablecoin (`tests/sss-1.test.ts`)

| Test | Description |
|---|---|
| Initialize | Creates mint with Token-2022, config PDA, roles |
| Mint | Minter role can mint tokens with quota enforcement |
| Burn | Burner role can burn tokens |
| Freeze/Thaw | Freezer can freeze and thaw accounts |
| Pause/Unpause | Pauser can pause all operations |
| Role Management | Master can assign/revoke 6 RBAC roles |
| Supply Cap | Enforces maximum supply limit |
| Epoch Quota | 24h minter quota with reset |
| Batch Mint | Mint to multiple recipients in one tx |
| Multisig | Proposal → approval → execute governance flow |
| Error Cases | Wrong signer, paused state, exceeded quota |

### SSS-2: Compliance Transfer Hook (`tests/sss-2.test.ts`)

| Test | Description |
|---|---|
| Initialize with Hook | Creates mint with transfer hook extension |
| Transfer Fees | Basis points fee with max cap |
| Whitelist | Fee bypass for whitelisted addresses |
| Blacklist | Block transfers from/to blacklisted addresses |
| Permanent Delegate | Bypass all restrictions |
| Asset Seizure | Seize from blacklisted accounts |
| Emergency Pause | Pause all transfers |
| Batch Blacklist | Batch compliance operations |
| Audit Events | 13+ audit event types |

### SSS-2 Hook (`tests/sss2_hook.ts`)

| Test | Description |
|---|---|
| Hook Execution | Transfer hook validates on every transfer |
| Blacklist Enforcement | Hook blocks blacklisted sender/receiver |
| Extra Account Metas | Validates correct PDA resolution |

### Privacy Tests (`tests/privacy.test.ts`)

| Test | Description |
|---|---|
| Confidential Setup | ConfidentialTransferMint extension |
| Auditor Key | ElGamal auditor key model |
| Transfer Privacy | Confidential transfer operations |

### Fuzz Tests (`tests/fuzz.test.ts`)

| Test | Description |
|---|---|
| Random Operations | Randomized operation sequences |
| Edge Cases | Boundary values, overflow, underflow |
| Concurrent Access | Simulate concurrent role operations |
| Invalid Inputs | Malformed data, wrong accounts |

## Test Configuration

Tests use Anchor's local validator with the following configuration:

```toml
# Anchor.toml
[test]
startup_wait = 5000

[test.validator]
url = "https://api.devnet.solana.com"
```

## Writing New Tests

1. Create a new test file in `tests/` directory
2. Import the test context from existing helpers
3. Follow the describe/it pattern used in existing tests
4. Set appropriate timeouts (120s minimum for on-chain tests)

```typescript
import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

describe("New Feature", () => {
  // Setup provider and program
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  it("should do something", async () => {
    // Test implementation
  });
});
```
