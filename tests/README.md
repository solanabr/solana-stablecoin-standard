# Solana Stablecoin Standard - Tests

Comprehensive test suite for SSS including unit tests, integration tests, and fuzz tests.

## Prerequisites

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.0
avm use 0.30.0

# Install Node.js dependencies
npm install
```

## Test Structure

```
tests/
├── integration/          # Integration tests
│   ├── sss1-flow.test.ts    # SSS-1 complete flow
│   ├── sss2-flow.test.ts    # SSS-2 with compliance
│   └── cross-preset.test.ts # Cross-preset tests
├── fuzz/                # Fuzz tests (Trident)
│   ├── mint-burn.rs
│   └── blacklist.rs
└── stress/              # Stress tests
    └── load-test.ts
```

## Running Tests

### Quick Start

```bash
# Run all tests
npm test

# Run specific test suite
npm run test:sss1        # SSS-1 integration tests
npm run test:sss2        # SSS-2 integration tests
npm run test:integration # All integration tests
npm run test:fuzz        # Fuzz tests (requires Trident)
```

### Step-by-Step Testing

#### 1. Start Local Validator

```bash
# Terminal 1: Start Solana test validator
solana-test-validator
```

#### 2. Build Programs

```bash
# Terminal 2: Build Anchor programs
cd programs
anchor build
```

#### 3. Run Tests

```bash
# Run Anchor tests (includes program deployment)
anchor test

# Or run specific test file
anchor test tests/integration/sss1-flow.test.ts

# Run with logs
anchor test -- --show-logs
```

### Testing on Devnet

```bash
# Configure Solana CLI for Devnet
solana config set --url devnet

# Get Devnet SOL
solana airdrop 2

# Deploy programs to Devnet
anchor deploy --provider.cluster devnet

# Run tests against Devnet
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com anchor test --skip-local-validator
```

## Test Coverage

### SSS-1 Tests (sss1-flow.test.ts)

✅ Initialize stablecoin with SSS-1 preset  
✅ Add minters with daily quotas  
✅ Add burners and pausers  
✅ Mint tokens to multiple users  
✅ Enforce daily quota limits  
✅ Transfer tokens between users  
✅ Freeze and thaw accounts  
✅ Burn tokens  
✅ Pause and unpause operations  
✅ Query stablecoin info and supply  

### SSS-2 Tests (sss2-flow.test.ts)

✅ Initialize stablecoin with SSS-2 preset  
✅ All SSS-1 operations  
✅ Add addresses to blacklist  
✅ Remove addresses from blacklist  
✅ Transfer hook enforcement  
✅ Seize tokens from frozen accounts  
✅ Compliance statistics  
✅ Audit trail verification  

### Fuzz Tests

✅ Random mint/burn operations  
✅ Quota boundary testing  
✅ Blacklist edge cases  
✅ Concurrent operations  

## Writing New Tests

### Test Template

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";

describe("My Test Suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.StablecoinCore as Program;
  
  before(async () => {
    // Setup
  });
  
  it("should do something", async () => {
    // Test implementation
    const tx = await program.methods
      .someInstruction()
      .accounts({
        // accounts
      })
      .rpc();
      
    // Assertions
    expect(tx).to.exist;
  });
  
  after(() => {
    // Cleanup
  });
});
```

### Best Practices

1. **Use descriptive test names**: Clearly state what is being tested
2. **Test one thing per test**: Keep tests focused and atomic
3. **Use proper setup/teardown**: Initialize in `before()`, cleanup in `after()`
4. **Verify state changes**: Always check that operations had the expected effect
5. **Test error cases**: Verify that invalid operations fail correctly
6. **Use realistic data**: Test with amounts and scenarios similar to production

## Debugging Tests

### Enable Verbose Logging

```bash
# Show program logs
anchor test -- --show-logs

# Show transaction details
RUST_LOG=debug anchor test
```

### Common Issues

#### 1. Airdrop Failures

```bash
# If airdrops fail on localnet, restart validator
pkill solana-test-validator
solana-test-validator --reset
```

#### 2. Account Not Found

```bash
# Ensure programs are deployed
anchor build
anchor deploy
```

#### 3. Signature Verification Failed

```bash
# Check that correct signers are provided
.signers([keypair1, keypair2])
```

#### 4. Insufficient Funds

```bash
# Airdrop more SOL
solana airdrop 10 <ADDRESS>
```

## Performance Testing

### Load Testing

```bash
# Run stress tests
cd tests/stress
npm run load-test

# Configure parameters
CONCURRENT_USERS=100 DURATION=60 npm run load-test
```

### Benchmarking

```bash
# Measure transaction costs
anchor test tests/benchmark.test.ts

# Output:
# Initialize: ~50,000 CU, 0.01 SOL rent
# Mint: ~5,000 CU
# Burn: ~5,000 CU
# Transfer (SSS-1): ~5,000 CU
# Transfer (SSS-2): ~8,000 CU
```

## Continuous Integration

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Install Solana
        run: sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
      - name: Install Anchor
        run: cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
      - name: Run tests
        run: anchor test
```

## Test Data

### Sample Accounts

```typescript
// Test authority (multi-sig in production)
const authority = Keypair.generate();

// Test minters
const minter1 = Keypair.generate(); // Quota: 1M tokens/day
const minter2 = Keypair.generate(); // Quota: 500K tokens/day

// Test users
const user1 = Keypair.generate();
const user2 = Keypair.generate();

// Compliance officers (SSS-2)
const blacklister = Keypair.generate();
const seizer = Keypair.generate();
```

### Sample Amounts

```typescript
const ONE_TOKEN = new BN(1_000_000);      // 1 token (6 decimals)
const TEN_TOKENS = new BN(10_000_000);    // 10 tokens
const HUNDRED_TOKENS = new BN(100_000_000); // 100 tokens
const THOUSAND_TOKENS = new BN(1_000_000_000); // 1,000 tokens
```

## Troubleshooting

### Test Failures

1. **Check program logs**: `anchor test -- --show-logs`
2. **Verify account state**: Use `program.account.*.fetch()`
3. **Check transaction signatures**: Ensure all required signers are included
4. **Validate PDAs**: Verify PDA derivation matches program expectations

### Performance Issues

1. **Reduce airdrop amounts**: Use minimum required SOL
2. **Reuse accounts**: Don't create new accounts for every test
3. **Batch operations**: Group related transactions
4. **Use localnet**: Faster than devnet for testing

## Resources

- [Anchor Testing Guide](https://www.anchor-lang.com/docs/testing)
- [Solana Test Validator](https://docs.solana.com/developing/test-validator)
- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertions](https://www.chaijs.com/)

## Support

For issues or questions:
- GitHub Issues: [github.com/solanabr/solana-stablecoin-standard/issues](https://github.com/solanabr/solana-stablecoin-standard/issues)
- Discord: [discord.gg/superteambrasil](https://discord.gg/superteambrasil)
