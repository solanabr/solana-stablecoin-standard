#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SSS Devnet Deployment Script
# Deploys sss-core and sss-transfer-hook to Solana devnet
# Usage: ./scripts/deploy-devnet.sh [KEYPAIR_PATH]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

KEYPAIR=${1:-"$HOME/.config/solana/id.json"}
CLUSTER="devnet"
RPC_URL="https://api.devnet.solana.com"

SSS_CORE_PROGRAM_ID="SSSXsBqANHdRRPBEiNUjGjgARJmQR1tQHNBqJBMvFUw"
SSS_HOOK_PROGRAM_ID="SSSHooKvTgEyqsX1mEBHXrLHyWzGGY9V8tECJpJPZyp"

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[SSS]${NC} $1"; }
ok()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn(){ echo -e "${YELLOW}[WARN]${NC} $1"; }

# ─── Prerequisites ────────────────────────────────────────────────────────────
log "Checking prerequisites..."
command -v solana >/dev/null 2>&1 || { echo "solana-cli not found. Install from https://docs.solana.com/cli/install-solana-cli-tools"; exit 1; }
command -v anchor >/dev/null 2>&1 || { echo "anchor not found. Install from https://anchor.projectserum.com/"; exit 1; }

# ─── Configure ────────────────────────────────────────────────────────────────
log "Configuring Solana CLI for devnet..."
solana config set --url "$RPC_URL" --keypair "$KEYPAIR"

DEPLOYER=$(solana address)
log "Deployer: $DEPLOYER"

BALANCE=$(solana balance --lamports 2>/dev/null | awk '{print $1}')
log "Balance: ${BALANCE} lamports"

if [ "${BALANCE:-0}" -lt 2000000000 ]; then
  log "Requesting airdrop (2 SOL)..."
  solana airdrop 2 || warn "Airdrop failed — may need manual funding"
  sleep 3
fi

# ─── Build ────────────────────────────────────────────────────────────────────
log "Building programs..."
anchor build

# ─── Deploy sss-transfer-hook ──────────────────────────────────────────────
log "Deploying sss-transfer-hook..."
HOOK_DEPLOY=$(solana program deploy \
  --program-id "$SSS_HOOK_PROGRAM_ID" \
  target/deploy/sss_transfer_hook.so \
  --url "$RPC_URL" \
  --keypair "$KEYPAIR" \
  2>&1)

HOOK_DEPLOYED_ID=$(echo "$HOOK_DEPLOY" | grep "Program Id" | awk '{print $NF}')
ok "Transfer Hook deployed: $HOOK_DEPLOYED_ID"
ok "Explorer: https://explorer.solana.com/address/$HOOK_DEPLOYED_ID?cluster=$CLUSTER"

# ─── Deploy sss-core ──────────────────────────────────────────────────────────
log "Deploying sss-core..."
CORE_DEPLOY=$(solana program deploy \
  --program-id "$SSS_CORE_PROGRAM_ID" \
  target/deploy/sss_core.so \
  --url "$RPC_URL" \
  --keypair "$KEYPAIR" \
  2>&1)

CORE_DEPLOYED_ID=$(echo "$CORE_DEPLOY" | grep "Program Id" | awk '{print $NF}')
ok "SSS-Core deployed: $CORE_DEPLOYED_ID"
ok "Explorer: https://explorer.solana.com/address/$CORE_DEPLOYED_ID?cluster=$CLUSTER"

# ─── Smoke test: initialize SSS-1 ─────────────────────────────────────────────
log "Running smoke test: Initialize SSS-1 stablecoin..."
node scripts/smoke-test.js --cluster "$CLUSTER" --keypair "$KEYPAIR"

# ─── Write deployment proof ───────────────────────────────────────────────────
PROOF_FILE="deployment-proof.json"
cat > "$PROOF_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "network": "$CLUSTER",
  "deployer": "$DEPLOYER",
  "programs": {
    "sss_core": {
      "programId": "$CORE_DEPLOYED_ID",
      "explorer": "https://explorer.solana.com/address/$CORE_DEPLOYED_ID?cluster=$CLUSTER"
    },
    "sss_transfer_hook": {
      "programId": "$HOOK_DEPLOYED_ID",
      "explorer": "https://explorer.solana.com/address/$HOOK_DEPLOYED_ID?cluster=$CLUSTER"
    }
  }
}
EOF

ok "Deployment proof written to $PROOF_FILE"
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             SSS DEVNET DEPLOYMENT COMPLETE                   ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  SSS-Core:          $CORE_DEPLOYED_ID"
echo "║  SSS-Transfer-Hook: $HOOK_DEPLOYED_ID"
echo "║  Network:           $CLUSTER"
echo "╚══════════════════════════════════════════════════════════════╝"
