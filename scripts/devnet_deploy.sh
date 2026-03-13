#!/bin/bash
set -e

# SSS Devnet Deployment Script
# 
# Usage: ./devnet_deploy.sh path/to/keypair.json

KEYPAIR=${1:-~/.config/solana/id.json}
CLUSTER="https://api.devnet.solana.com"

echo "====================================================="
echo " Deploying Solana Stablecoin Standard (SSS) to Devnet "
echo "====================================================="
echo "Authority Keypair: $KEYPAIR"
echo "Target Cluster: $CLUSTER"

# Configure CLI
solana config set --url $CLUSTER
solana config set --keypair $KEYPAIR

# Check balance
BALANCE=$(solana balance | awk '{print $1}')
echo "Current Balance: $BALANCE SOL"
if (( $(echo "$BALANCE < 3.0" | bc -l) )); then
  echo "[WARNING] Low balance. Requesting airdrop..."
  solana airdrop 2 > /dev/null 2>&1 || true
fi

# Build
echo "Building Anchor workspace (BPF targets)..."
anchor build

# Deploy Core Program
echo "Deploying SSS Core Program..."
solana program deploy \
  --program-id target/deploy/sss-keypair.json \
  target/deploy/sss.so \
  --url $CLUSTER

# Deploy Transfer Hook
echo "Deploying SSS Transfer Hook..."
solana program deploy \
  --program-id target/deploy/transfer_hook-keypair.json \
  target/deploy/transfer_hook.so \
  --url $CLUSTER

echo "====================================================="
echo " Deployment Complete! "
echo "====================================================="
echo "SSS Core ID: $(solana address -k target/deploy/sss-keypair.json)"
echo "Transfer Hook ID: $(solana address -k target/deploy/transfer_hook-keypair.json)"
echo "Update your Anchor.toml and re-run standard client tests if IDs changed."
