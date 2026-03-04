# Testing Guide

## Overview

The Solana Stablecoin Standard includes comprehensive test coverage:
- Unit tests for all instructions
- Integration tests for SSS-1 and SSS-2 flows
- End-to-end scenarios

## Running Tests

### All Tests

```bash
anchor test
```

### Specific Test Files

```bash
# SSS-1 tests
anchor test -- --grep "SSS-1"

# SSS-2 tests
anchor test -- --grep "SSS-2"
```

### With Logs

```bash
anchor test -- --show-logs
```

## Test Structure

```
tests/
├── integration/
│   ├── sss1-flow.test.ts    # SSS-1 integration tests
│   └── sss2-flow.test.ts    # SSS-2 integration tests
└── README.md
```

## SSS-1 Test Coverage

- ✅ Initialize stablecoin
- ✅ Mint tokens
- ✅ Burn tokens
- ✅ Freeze/thaw accounts
- ✅ Pause/unpause operations
- ✅ Role management
- ✅ Authority transfer

## SSS-2 Test Coverage

All SSS-1 tests plus:
- ✅ Blacklist add/remove
- ✅ Transfer hook enforcement
- ✅ Seize tokens from frozen accounts
- ✅ Compliance checks

## Writing Tests

### Example Test

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

describe("SSS-1 Flow", () => {
  it("should initialize stablecoin", async () => {
    const stable = await SolanaStablecoin.create(connection, {
      preset: Presets.SSS_1,
      name: "Test USD",
      symbol: "TUSD",
      decimals: 6,
      authority: authorityKeypair,
    });
    
    const info = await stable.getInfo();
    expect(info.name).to.equal("Test USD");
  });
});
```

## Test Configuration

Edit `Anchor.toml`:

```toml
[test]
startup_wait = 10000

[test.validator]
url = "https://api.devnet.solana.com"
```

## Debugging Tests

### Enable Logs

```bash
export ANCHOR_LOG=true
anchor test
```

### Run Single Test

```bash
anchor test -- --grep "should mint tokens"
```

### Inspect Accounts

```typescript
const state = await program.account.stablecoinState.fetch(stateAddress);
console.log("State:", state);
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: anchor test
```

## Performance Testing

```bash
# Stress test minting
for i in {1..100}; do
  sss-token mint <address> 1000000
done
```

## Test Results

Expected output:
```
  SSS-1 Flow
    ✓ should initialize stablecoin (2000ms)
    ✓ should mint tokens (1500ms)
    ✓ should burn tokens (1500ms)
    ✓ should freeze account (1000ms)
    
  SSS-2 Flow
    ✓ should add to blacklist (1500ms)
    ✓ should block transfer to blacklisted (2000ms)
    ✓ should seize tokens (2000ms)

  36 passing (45s)
```
