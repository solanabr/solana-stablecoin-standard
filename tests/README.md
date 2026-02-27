# SSS Token Test Suite

Test suite for Solana Stablecoin Standard (SSS) implementation.

## Structure

```
tests/
├── sss-1.test.ts       # Minimal stablecoin tests
├── sss-2.test.ts       # Compliant stablecoin tests
├── fuzz.test.ts        # Fuzz tests
└── README.md           # This file
```

## Prerequisites

```bash
npm install
anchor build
```

## Running Tests

### SSS-1 (Minimal Stablecoin)
Tests basic functionality without compliance features:
- Initialize
- Mint/Burn
- Pause/Unpause
- Role management

```bash
anchor test tests/sss-1.test.ts
```

### SSS-2 (Compliant Stablecoin)
Tests SSS-2 with transfer hook, blacklist, and permanent delegate:
- Initialize with features
- Transfer hook invocation
- Blacklist management
- Token seizure
- Configuration updates

```bash
anchor test tests/sss-2.test.ts
```

### Fuzz Tests
Tests edge cases and random inputs:
- Random initialization parameters
- Edge case amounts
- Batch operations
- Role combinations
- Epoch behavior

```bash
anchor test tests/fuzz.test.ts
```

### Run All Tests
```bash
anchor test
```

## Test Coverage

### SSS-1 (Minimal Stablecoin)
- ✅ Initialize token
- ✅ Mint as master/minter
- ✅ Burn as owner/burner
- ✅ Freeze/Thaw accounts
- ✅ Pause/Unpause contract
- ✅ Role assignment
- ✅ Minter quota management
- ✅ Epoch minting limits
- ❌ Multisig operations (requires additional setup)

### SSS-2 (Compliant Stablecoin)
- ✅ Initialize with features
- ✅ Initialize transfer hook
- ✅ Transfer hook execution
- ✅ Blacklist add/remove
- ✅ Token seizure (requires permanent delegate)
- ✅ Fee configuration
- ✅ Permission management
- ✅ Whitelist management

### Fuzz Tests
- ✅ Random string/integer inputs
- ✅ Edge case amounts (min, max, overflow)
- ✅ Batch operations with random counts
- ✅ Invalid role combinations
- ✅ Epoch reset scenarios

## Known Limitations

1. **Transfer Hook Execution**: Requires full Token-2022 integration for complete testing
2. **Multisig Operations**: Requires additional setup for multisig config
3. **Permanent Delegate**: Requires program deployment for full seizure testing
4. **Trident Fuzzing**: Advanced fuzzing via Trident crate in Rust (optional)

## CI/CD Integration

```yaml
name: Anchor Tests
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: metadaoproject/anchor-test@main
      - run: anchor test
```

## Debugging

Enable verbose output:
```bash
anchor test --verbose
```

Single test:
```bash
anchor test --grep "Should initialize"
```

## References

- [Anchor Testing Guide](https://book.anchor-lang.com/programs/testing.html)
- [Token-2022 Transfer Hook](https://spl.solana.com/token-2022/extensions#transfer-hook)
- [Solana Stablecoin Standard Specification](../docs/)
