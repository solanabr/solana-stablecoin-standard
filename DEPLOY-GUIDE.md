# Devnet Deployment Guide

## ✅ Pre-Deployment Setup Complete

### Your Deployment Wallet
| Item | Value |
|------|-------|
| **Public Key** | `2UucbocQDmibY3mE1a7VDxNEzJtU5LeyDyMRZwHRPHip` |
| **Balance** | 10 SOL (confirmed) |
| **Keypair File** | `/workspaces/SSS/deploy-keypair.json` |

### Environment Prepared
- ✅ Solana CLI installed
- ✅ Wallet configured for Devnet
- ✅ 10 SOL balance confirmed

---

## 🚀 Deployment Steps

### Option 1: Deploy Using Local Machine (Recommended)

#### Step 1: Clone Repository Locally
```bash
git clone <your-repo-url>
cd SSS
```

#### Step 2: Install Prerequisites
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana-install init 3.0.6

# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --force
```

#### Step 3: Copy Deployment Keypair
Copy `/workspaces/SSS/deploy-keypair.json` from the codespace to your local machine:
```bash
# On codespace, copy keypair content
cat /workspaces/SSS/deploy-keypair.json

# On local machine, save to ~/.config/solana/id.json
# Then convert to Solana CLI format (64 bytes)
```

#### Step 4: Build Programs
```bash
anchor build
```

#### Step 5: Deploy to Devnet
```bash
# Set to devnet
solana config set --url devnet

# Verify balance
solana balance  # Should show 10 SOL

# Deploy programs
anchor deploy --provider.cluster devnet
```

#### Step 6: Record Program IDs
After deployment, update:
- `Anchor.toml` with new program IDs
- `README.md` with program IDs
- `DEPLOYMENT.md` with example transactions

---

### Option 2: Deploy Using GitHub Actions

Create `.github/workflows/deploy-devnet.yml`:

```yaml
name: Deploy to Devnet

on:
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Solana
        uses: metadaoproject/setup-solana@v1
        with:
          solana-version: 3.0.6
          
      - name: Setup Anchor
        uses: metadaoproject/setup-anchor@v2
        with:
          anchor-version: 0.32.1
          
      - name: Configure Keypair
        run: |
          echo '${{ secrets.DEPLOY_KEYPAIR }}' > ~/.config/solana/id.json
          
      - name: Deploy
        run: |
          solana config set --url devnet
          anchor build
          anchor deploy --provider.cluster devnet
```

---

### Option 3: One-Command Deployment Script

Save this as `deploy.sh` and run:

```bash
#!/bin/bash
set -e

echo "=== SSS Devnet Deployment ==="

# Install dependencies if needed
if ! command -v solana &> /dev/null; then
    echo "Installing Solana CLI..."
    sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
fi

if ! command -v anchor &> /dev/null; then
    echo "Installing Anchor CLI..."
    cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --force
fi

# Setup
echo "Setting up environment..."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana config set --url devnet

# Copy keypair (adjust path as needed)
KEYPAIR_PATH="${1:-deploy-keypair.json}"
if [ -f "$KEYPAIR_PATH" ]; then
    mkdir -p ~/.config/solana
    python3 << EOF
import json
import nacl.signing

with open('$KEYPAIR_PATH', 'r') as f:
    secret = bytes(json.load(f))

signing_key = nacl.signing.SigningKey(secret)
public_key = bytes(signing_key.verify_key)
full_keypair = list(secret + public_key)

with open('~/.config/solana/id.json', 'w') as f:
    json.dump(full_keypair, f)
print('Keypair configured')
EOF
fi

# Check balance
BALANCE=$(solana balance | awk '{print $1}')
echo "Balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 5" | bc -l) )); then
    echo "❌ Insufficient balance"
    exit 1
fi

# Build
echo "Building programs..."
anchor build

# Deploy
echo "Deploying to Devnet..."
anchor deploy --provider.cluster devnet

echo "✅ Deployment complete!"
echo "Update Anchor.toml with the new program IDs"
```

---

## 📋 Post-Deployment Checklist

After deployment, verify:

- [ ] Programs deployed successfully
- [ ] Program IDs recorded in Anchor.toml
- [ ] Example transactions created
- [ ] Devnet explorer links work:
  - `https://solana.fm/address/<PROGRAM_ID>?cluster=devnet`
- [ ] Initialize SSS-1 test transaction
- [ ] Initialize SSS-2 test transaction
- [ ] Update README.md with program IDs

---

## 🔧 Keypair Format Conversion

The deployment keypair is in 32-byte format. Solana CLI requires 64-byte format.

**Convert using Python:**
```python
import json
import nacl.signing

# Read 32-byte keypair
with open('deploy-keypair.json', 'r') as f:
    secret = bytes(json.load(f))

# Derive public key
signing_key = nacl.signing.SigningKey(secret)
public_key = bytes(signing_key.verify_key)

# Create 64-byte keypair
full_keypair = list(secret + public_key)

# Save for Solana CLI
with open('~/.config/solana/id.json', 'w') as f:
    json.dump(full_keypair, f)

print(f"Public Key: {public_key.hex()}")
```

---

## 📊 Expected Deployment Cost

| Program | Size | Cost (SOL) |
|---------|------|-----------|
| sss-stablecoin | ~150 KB | ~3-4 SOL |
| sss-transfer-hook | ~100 KB | ~2-3 SOL |
| **Total** | | **~5-7 SOL** |

Your 10 SOL balance is sufficient.

---

## 🆘 Troubleshooting

### "Insufficient balance"
- Verify: `solana balance`
- Check you're on devnet: `solana config get`

### "Program too large"
- Optimize: `anchor build --release`
- Check: `ls -lh target/deploy/*.so`

### "BPF compilation failed"
- Install platform tools: `solana-install init 3.0.6`
- Or use: `cargo build-sbf`

### "Anchor version mismatch"
- Check: `anchor --version`
- Install correct version: `cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --force`
- Install correct version: `cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --force`

---

## 📞 Support

For deployment issues:
1. Check [Anchor Documentation](https://book.anchor-lang.com/)
2. Review [Solana Deployment Guide](https://docs.solana.com/cli/deploy-a-program)
3. Open an issue on GitHub
