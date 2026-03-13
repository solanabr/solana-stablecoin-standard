# SSS Devnet Deployment & Verification

## 1. Prerequisites

- **Solana CLI**: `solana --version` (v1.18.x recommended)
- **Anchor CLI**: `anchor --version` (v0.29.0 recommended)
- **Node.js**: `node --version` (v18+ recommended)
- **Devnet SOL**: `solana airdrop 2` (or use a faucet)

## 2. Program Deployment

1. **Build Programs**:
   ```bash
   anchor build
   ```
2. **Deploy to Devnet**:
   ```bash
   anchor deploy --provider.cluster devnet
   ```
   - *Note*: Ensure `Anchor.toml` is configured for `[programs.devnet]`.

## 3. Stablecoin Initialization

Use the SSS SDK or CLI to initialize a new SSS-2 preset (Transfer Hook + Permanent Delegate).

```bash
# Initialize SSS-2 Metadata & Config
sss-token init \
  --name "BRL Stablecoin" \
  --symbol "BRLS" \
  --preset sss-2 \
  --cluster devnet
```

## 4. Verification Workflow

Once deployed, run the following sequence to verify institutional controls on devnet.

### A. Proof of Mint (With Quota)
```bash
# Update Quota for a Minter
sss-token quota update <MINTER_PUBKEY> 1000

# Mint tokens
sss-token mint <RECIPIENT_PUBKEY> 500
```
- **Verification**: Check Solscan for the `MintTo` instruction and the Custom SSS `MintEvent`.

### B. Proof of Compliance (Freeze)
```bash
# Freeze an account
sss-token freeze <TARGET_ACCOUNT>

# Attempt transfer (Expected to fail)
solana transfer --from <TARGET_ACCOUNT> <DEST> 1
```

### C. Proof of Blacklist & Seize (Institutional Guard)
```bash
# Add to Blacklist
sss-token blacklist add <MALICIOUS_USER>

# Verify Transfer Hook Interception
# Any attempt to transfer to/from MALICIOUS_USER will trigger Hook rejection.

# Execute Seizure
sss-token seize <MALICIOUS_USER> <TREASURY_ACCOUNT> 500
```

## 5. Explorer Verification
- **Program ID**: `HCzhfNz2Kc2wBfacsWzLsM5EdyUEeypFHRzbpDeMb9RM` (example)
- **Instruction Audit**: Navigate to the "Anchor Events" tab on Explorer/Solscan to see real-time `BlacklistAddEvent` and `SeizeEvent` logs.
