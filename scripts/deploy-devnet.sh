#!/usr/bin/env bash
#
# Deploy SSS programs to Solana devnet.
#
# Prerequisites:
#   - solana-cli configured with a funded devnet keypair
#   - anchor build completed (target/deploy/*.so present)
#
# Usage:
#   ./scripts/deploy-devnet.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

SSS_TOKEN_PROGRAM_ID="5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4"
SSS_HOOK_PROGRAM_ID="FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy"

echo "=== SSS Devnet Deployment ==="
echo ""

# Switch to devnet
echo "[1/6] Configuring Solana CLI for devnet..."
solana config set --url https://api.devnet.solana.com
echo ""

# Check balance
echo "[2/6] Checking wallet balance..."
BALANCE=$(solana balance)
echo "  Balance: $BALANCE"
echo ""

# Build if needed
if [ ! -f "target/deploy/sss_token.so" ]; then
  echo "[3/6] Building programs..."
  anchor build
else
  echo "[3/6] Programs already built, skipping..."
fi
echo ""

# Deploy sss-token
echo "[4/6] Deploying sss-token..."
anchor deploy --provider.cluster devnet --program-name sss_token 2>&1 || {
  echo "  Note: If program is already deployed, use 'anchor upgrade' instead."
}
echo ""
echo "  sss-token program info:"
solana program show "$SSS_TOKEN_PROGRAM_ID" 2>&1 || true
echo ""

# Deploy sss-transfer-hook
echo "[5/6] Deploying sss-transfer-hook..."
anchor deploy --provider.cluster devnet --program-name sss_transfer_hook 2>&1 || {
  echo "  Note: If program is already deployed, use 'anchor upgrade' instead."
}
echo ""
echo "  sss-transfer-hook program info:"
solana program show "$SSS_HOOK_PROGRAM_ID" 2>&1 || true
echo ""

# Run example transactions
echo "[6/6] Running example transactions..."
echo ""

WALLET=$(solana address)
echo "  Wallet: $WALLET"
echo ""

echo "  Initializing SSS-1 stablecoin..."
SSS_BIN="$PROJECT_DIR/target/debug/sss"
if [ -f "$SSS_BIN" ]; then
  $SSS_BIN --url https://api.devnet.solana.com init \
    --preset sss-1 \
    --name "DevnetUSD" \
    --symbol "dUSD" \
    --decimals 6 2>&1 || echo "  (init may fail if already deployed)"
  echo ""
else
  echo "  CLI binary not found. Build with: cd cli && cargo build"
  echo ""
fi

echo "=== Deployment Complete ==="
echo ""
echo "Program IDs:"
echo "  sss-token:         $SSS_TOKEN_PROGRAM_ID"
echo "  sss-transfer-hook: $SSS_HOOK_PROGRAM_ID"
echo ""
echo "Explorer:"
echo "  https://explorer.solana.com/address/$SSS_TOKEN_PROGRAM_ID?cluster=devnet"
echo "  https://explorer.solana.com/address/$SSS_HOOK_PROGRAM_ID?cluster=devnet"
