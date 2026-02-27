#!/usr/bin/env bash
# scripts/deploy-devnet.sh
# Deploy SSS programs to Solana devnet and save proof
set -e

CLUSTER="devnet"
DEPLOY_DIR="deployments"
PROOF_FILE="$DEPLOY_DIR/devnet-proof.json"

mkdir -p "$DEPLOY_DIR"

echo "=== Solana Stablecoin Standard — Devnet Deployment ==="
echo "Cluster: $CLUSTER"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Switch to devnet
solana config set --url https://api.devnet.solana.com
echo "RPC: $(solana config get | grep 'RPC URL' | awk '{print $3}')"

# Check wallet
WALLET=$(solana address)
echo "Wallet: $WALLET"

# Airdrop if balance low
BALANCE=$(solana balance --lamports | awk '{print $1}')
if [ "$BALANCE" -lt 2000000000 ]; then
  echo "Balance low ($BALANCE lamports), requesting airdrop..."
  solana airdrop 2
  sleep 5
fi

echo ""
echo "Building programs..."
anchor build

echo ""
echo "Deploying sss-token..."
SSS_TOKEN_ID=$(anchor deploy \
  --program-name sss_token \
  --provider.cluster devnet \
  2>&1 | grep "Program Id:" | awk '{print $3}')

echo "sss-token deployed: $SSS_TOKEN_ID"

echo ""
echo "Deploying sss-transfer-hook..."
SSS_HOOK_ID=$(anchor deploy \
  --program-name sss_transfer_hook \
  --provider.cluster devnet \
  2>&1 | grep "Program Id:" | awk '{print $3}')

echo "sss-transfer-hook deployed: $SSS_HOOK_ID"

# Get current slot
SLOT=$(solana slot)

# Write proof file
cat > "$PROOF_FILE" << EOF
{
  "network": "$CLUSTER",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "slot": $SLOT,
  "deployer": "$WALLET",
  "programs": {
    "sss_token": {
      "programId": "$SSS_TOKEN_ID",
      "explorerUrl": "https://explorer.solana.com/address/$SSS_TOKEN_ID?cluster=devnet"
    },
    "sss_transfer_hook": {
      "programId": "$SSS_HOOK_ID",
      "explorerUrl": "https://explorer.solana.com/address/$SSS_HOOK_ID?cluster=devnet"
    }
  }
}
EOF

echo ""
echo "=== Deployment complete ==="
echo "Proof saved to: $PROOF_FILE"
cat "$PROOF_FILE"
