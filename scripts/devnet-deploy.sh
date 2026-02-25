#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/devnet-deploy.sh
#
# Deploy sss-token and transfer-hook programs to Solana devnet,
# then run a live smoke-test exercising the full SSS-1 and SSS-2 lifecycles.
#
# Prerequisites:
#   1. solana CLI configured: solana config set --url devnet
#   2. Deployer wallet funded with at least 4 SOL
#      (sss-token ~546KB ≈ 2.0 SOL, transfer-hook ~231KB ≈ 0.9 SOL)
#   3. Programs built: anchor build
#
# Usage:
#   chmod +x scripts/devnet-deploy.sh
#   ./scripts/devnet-deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CLUSTER="devnet"
RPC="https://api.devnet.solana.com"

echo "══════════════════════════════════════════════════"
echo " SSS Devnet Deploy"
echo " cluster : $CLUSTER"
echo " wallet  : $(solana address)"
echo " balance : $(solana balance --url $CLUSTER)"
echo "══════════════════════════════════════════════════"

# ── Step 1: Switch CLI to devnet ─────────────────────────────────────────────
solana config set --url "$CLUSTER"

# ── Step 2: Build programs ───────────────────────────────────────────────────
echo ""
echo "→ Building programs..."
anchor build

# ── Step 3: Deploy ──────────────────────────────────────────────────────────
echo ""
echo "→ Deploying transfer-hook..."
anchor deploy --provider.cluster "$CLUSTER" \
  --program-name transfer-hook \
  --program-keypair target/deploy/transfer_hook-keypair.json

echo ""
echo "→ Deploying sss-token..."
anchor deploy --provider.cluster "$CLUSTER" \
  --program-name sss-token \
  --program-keypair target/deploy/sss_token-keypair.json

# ── Step 4: Verify deployments ───────────────────────────────────────────────
SSS_TOKEN_ID=$(solana address -k target/deploy/sss_token-keypair.json)
HOOK_ID=$(solana address -k target/deploy/transfer_hook-keypair.json)

echo ""
echo "✔ Deployed program IDs:"
echo "  sss-token     : $SSS_TOKEN_ID"
echo "  transfer-hook : $HOOK_ID"
echo ""
echo "  Explorer links:"
echo "  https://explorer.solana.com/address/$SSS_TOKEN_ID?cluster=devnet"
echo "  https://explorer.solana.com/address/$HOOK_ID?cluster=devnet"

# ── Step 5: Run demo transactions ───────────────────────────────────────────
echo ""
echo "→ Running devnet smoke-test transactions..."

DEMO_SCRIPT="$(dirname "$0")/devnet-demo.ts"
if [ -f "$DEMO_SCRIPT" ]; then
  ANCHOR_PROVIDER_URL="$RPC" ts-node "$DEMO_SCRIPT"
else
  echo "  Note: devnet-demo.ts not found — run anchor test against devnet manually:"
  echo "  ANCHOR_PROVIDER_URL=$RPC anchor test --skip-local-validator"
fi

echo ""
echo "══════════════════════════════════════════════════"
echo " Deploy complete. Update README Devnet Proof with"
echo " the program IDs and transaction signatures above."
echo "══════════════════════════════════════════════════"
