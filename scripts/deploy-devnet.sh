#!/usr/bin/env bash
#
# Deploy SSS programs to devnet and run smoke test
#
# Prerequisites:
#   - anchor CLI installed
#   - solana CLI installed and configured for devnet
#   - Keypair funded with ~5 SOL devnet
#
# Usage:
#   bash scripts/deploy-devnet.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Add tools to PATH
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"

cd "$ROOT_DIR"

echo "=== SSS Devnet Deployment ==="
echo ""

# 1. Check prerequisites
echo "Checking prerequisites..."
command -v anchor >/dev/null 2>&1 || { echo "ERROR: anchor not found"; exit 1; }
command -v solana >/dev/null 2>&1 || { echo "ERROR: solana not found"; exit 1; }

# 2. Check cluster
CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $NF}')
echo "RPC URL: $CLUSTER"

if [[ "$CLUSTER" != *"devnet"* ]]; then
  echo "WARNING: Not connected to devnet. Setting cluster..."
  solana config set --url https://api.devnet.solana.com
fi

# 3. Check balance
BALANCE=$(solana balance | awk '{print $1}')
echo "Balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 2" | bc -l 2>/dev/null || echo "1") )); then
  echo ""
  echo "Insufficient SOL. Attempting airdrop..."
  solana airdrop 2 || {
    echo ""
    echo "Airdrop failed (rate limited). Options:"
    echo "  1. Wait 24h for rate limit reset"
    echo "  2. Visit https://faucet.solana.com"
    echo "  3. Transfer devnet SOL from another wallet"
    echo ""
    echo "Current address: $(solana address)"
    exit 1
  }
fi

# 4. Build
echo ""
echo "Building programs..."
anchor build

# 5. Deploy
echo ""
echo "Deploying sss-core..."
anchor deploy --provider.cluster devnet --program-name sss_core 2>&1 || {
  echo "Deploying with anchor deploy..."
  anchor deploy --provider.cluster devnet
}

echo ""
echo "Deploying sss-transfer-hook..."
anchor deploy --provider.cluster devnet --program-name sss_transfer_hook 2>&1 || true

# 6. Verify deployments
echo ""
echo "Verifying deployments..."
solana program show G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL 2>/dev/null && echo "sss-core: OK" || echo "sss-core: NOT DEPLOYED"
solana program show EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389 2>/dev/null && echo "sss-transfer-hook: OK" || echo "sss-transfer-hook: NOT DEPLOYED"

# 7. Run smoke test
echo ""
echo "Running smoke test..."
npx ts-node scripts/devnet-smoke-test.ts

echo ""
echo "=== Deployment complete ==="
echo "Evidence: DEVNET_EVIDENCE.md"
