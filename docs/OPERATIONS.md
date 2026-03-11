# Operations Guide

## Prerequisites

- Solana CLI v2.x+
- Anchor CLI v0.31.1
- Node.js 18+

## Local Development

```bash
# Build programs
anchor build

# Run tests
anchor test

# Start local validator
solana-test-validator
```

## Deploying

```bash
# Switch to target network
solana config set --url devnet

# Deploy both programs
anchor deploy --provider.cluster devnet

# Verify deployment
solana program show SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA
solana program show Fi6N4Z2Xm47dRmLoDRcVAvoiQ1UnT2WcuzvwjXvcB8mu
```

## Operational Procedures

### Creating a Stablecoin

1. Deploy both programs
2. Initialize the mint with desired preset
3. For S³-2: Initialize the ExtraAccountMetaList
4. Add minters with appropriate allowances
5. Distribute tokens

### Emergency Pause

```bash
sss-token pause --mint <address> --url devnet
```

Pausing blocks all minting (program-level) and all transfers (via transfer hook for S³-2).

### Blacklisting an Address (S³-2)

```bash
# Blacklist (also freezes the account)
sss-token blacklist add <address> --reason "OFAC match" --mint <address>

# Seize tokens to treasury
sss-token thaw <address> --mint <address>
# Then seize via SDK (CLI seize coming soon)

# Remove from blacklist
sss-token blacklist remove <address> --mint <address>
```

### Ownership Transfer

```bash
# Step 1: Current owner initiates
sss-token transfer-ownership <new-owner> --mint <address>

# Step 2: New owner accepts (run with new owner's keypair)
sss-token accept-ownership --mint <address> --keypair <new-owner-keypair>
```

### Minter Management

```bash
# Add minter
sss-token minters add <address> --allowance 1000000000 --mint <address>

# Remove minter
sss-token minters remove <address> --mint <address>
```
