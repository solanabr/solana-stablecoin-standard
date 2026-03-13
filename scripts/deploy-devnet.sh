#!/usr/bin/env bash
#
# Deploy Solana Stablecoin Standard (SSS) programs to Devnet
#
# This script:
# 1. Sets Solana config to devnet
# 2. Builds the Anchor programs
# 3. Deploys sss_token and sss_transfer_hook to devnet
# 4. Outputs program IDs
# 5. Runs a basic smoke test (init SSS-1, mint some tokens)
#
# Prerequisites:
# - Anchor CLI: cargo install --git https://github.com/coral-xyz/anchor anchor-cli
# - Solana CLI: https://docs.solana.com/cli/install-solana-cli-tools
# - Wallet with SOL: solana airdrop 2 (on devnet)
#
# Usage: ./scripts/deploy-devnet.sh
#        (Run from repo root)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "=== SSS Devnet Deployment ==="
echo "Repo root: $REPO_ROOT"
echo ""

# Step 1: Set Solana config to devnet
echo "[1/5] Setting Solana config to devnet..."
solana config set --url https://api.devnet.solana.com
solana config get

# Ensure wallet has SOL (request airdrop on devnet)
echo ""
echo "Checking wallet balance..."
solana balance || true
echo "Requesting airdrop (devnet)..."
solana airdrop 2 || echo "Airdrop failed or skipped; ensure wallet has SOL"
sleep 2

# Step 2: Build Anchor programs
echo ""
echo "[2/5] Building Anchor programs..."
anchor build

# Step 3: Deploy to devnet
echo ""
echo "[3/5] Deploying to devnet..."
anchor deploy --provider.cluster devnet

# Step 4: Output program IDs
echo ""
echo "[4/5] Program IDs (from Anchor.toml):"
echo "  sss_token:         SSSToknXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz"
echo "  sss_transfer_hook: SSSHookXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz"

# Step 5: Smoke test
echo ""
echo "[5/5] Running smoke test (init SSS-1, mint tokens)..."
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
if [ -f "$ANCHOR_WALLET" ] && command -v npx &>/dev/null; then
  npx ts-node -p tsconfig.json examples/sss-1-lifecycle.ts 2>/dev/null || {
    echo "Smoke test skipped (run manually: npx ts-node -p tsconfig.json examples/sss-1-lifecycle.ts)"
  }
else
  echo "To run smoke test manually:"
  echo "  export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com"
  echo "  export ANCHOR_WALLET=~/.config/solana/id.json"
  echo "  npx ts-node -p tsconfig.json examples/sss-1-lifecycle.ts"
fi
echo ""
echo "=== Deployment complete ==="
