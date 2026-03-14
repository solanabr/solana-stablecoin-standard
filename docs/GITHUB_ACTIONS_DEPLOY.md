# GitHub Actions Deployment Guide

## Overview

We now have automated build and deployment via GitHub Actions. This avoids the local environment issues with platform-tools vs crate versions.

## Workflows

### 1. CI Workflow (`ci.yml`)
- **Triggers**: Push to main, pull requests
- **Jobs**:
  - Rust/Anchor build and test
  - JavaScript SDK tests
  - Docker compose build (backend)

### 2. Deploy Workflow (`deploy.yml`)
- **Triggers**:
  - Manual trigger (workflow_dispatch) - choose devnet or mainnet
  - Push to `deploy-devnet` branch
- **Jobs**:
  - Build programs
  - Deploy to selected cluster
  - Update Program IDs in code
  - Commit changes back to repo

## Setting Up Deployment

### Step 1: Create a Devnet Wallet

If you don't have a funded devnet wallet:

```bash
# Create new wallet
solana-keygen new -o deployer-keypair.json --no-passphrase

# Get the address
solana address -k deployer-keypair.json

# Fund on devnet (2 SOL should be plenty)
solana airdrop 2 $(solana address -k deployer-keypair.json) --url devnet

# Check balance
solana balance -k deployer-keypair.json --url devnet
```

### Step 2: Add Wallet to GitHub Secrets

1. Go to your GitHub repository: `https://github.com/grkhmz23/SSS`
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add secret:
   - **Name**: `DEPLOYER_KEYPAIR`
   - **Value**: Paste the contents of `deployer-keypair.json` (the entire JSON array)

### Step 3: Trigger Deployment

#### Option A: Manual Deployment
1. Go to **Actions** tab in your repo
2. Select **"Deploy to Devnet"** workflow
3. Click **"Run workflow"**
4. Select `devnet` from dropdown
5. Click **"Run workflow"**

#### Option B: Push to Deploy Branch
```bash
git checkout -b deploy-devnet
git push origin deploy-devnet
```

The workflow will automatically run and deploy.

## Monitoring Deployment

### Check Build Status
- Go to **Actions** tab: https://github.com/grkhmz23/SSS/actions
- Click on the latest workflow run
- Monitor the logs in real-time

### After Deployment

The workflow will:
1. Build the programs
2. Deploy to devnet
3. Extract the Program IDs
4. Update `Anchor.toml` with new addresses
5. Commit changes back to the repo

### Verify Deployment

```bash
# Get the program ID from Anchor.toml
grep "sss_stablecoin" Anchor.toml

# Verify on devnet
solana program show <PROGRAM_ID> --url devnet
```

## Program IDs

After deployment, your Program IDs will be stored in:
- `Anchor.toml` - Updated automatically
- `target/deploy/*-keypair.json` - Deployment keypairs

## Troubleshooting

### "Insufficient funds" error
- Make sure your wallet has SOL on devnet
- Check balance: `solana balance <ADDRESS> --url devnet`
- Request more airdrops if needed

### "Invalid keypair" error
- Ensure the `DEPLOYER_KEYPAIR` secret is the full JSON array
- Example format: `[12,34,56,...]` (64 numbers total)

### Build failures
- Check the **CI** workflow first - if CI passes, deployment should work
- Look at the specific error in the Actions logs

## Security Notes

⚠️ **Never commit your keypair to the repository!**
- Always use GitHub Secrets for private keys
- The `.gitignore` already excludes `*-keypair.json` files
- The deploy workflow only uses the secret in the CI environment

## Mainnet Deployment

To deploy to mainnet:
1. Ensure wallet has real SOL (not devnet SOL)
2. Use manual trigger: workflow_dispatch with `mainnet` option
3. **Double-check everything before deploying to mainnet!**

## Cost Estimates

### Devnet
- Free (use airdrops)
- ~3-5 SOL per program deployment

### Mainnet
- ~0.024 SOL per program (rent-exempt minimum)
- Total: ~0.05 SOL for both programs
- Plus transaction fees (~0.000005 SOL per tx)
