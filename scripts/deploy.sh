#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
#  deploy.sh — Deploy Solana Stablecoin Standard to devnet
# ───────────────────────────────────────────────────────────────────
set -euo pipefail

CLUSTER="${1:-devnet}"
ANCHOR_TOML="Anchor.toml"

echo "═══════════════════════════════════════════════════════════════"
echo "  Solana Stablecoin Standard — Deployment"
echo "  Cluster: ${CLUSTER}"
echo "═══════════════════════════════════════════════════════════════"

# ── Prerequisites ──────────────────────────────────────────────────

command -v solana >/dev/null 2>&1 || { echo "❌ solana CLI not found"; exit 1; }
command -v anchor >/dev/null 2>&1 || { echo "❌ anchor CLI not found"; exit 1; }

WALLET=$(solana address 2>/dev/null || true)
if [ -z "$WALLET" ]; then
  echo "❌ No Solana wallet configured. Run: solana-keygen new"
  exit 1
fi
echo "📝 Deployer wallet: ${WALLET}"

# ── Check balance ──────────────────────────────────────────────────

BALANCE=$(solana balance --url "${CLUSTER}" 2>/dev/null | awk '{print $1}')
echo "💰 Balance: ${BALANCE} SOL"

if (( $(echo "${BALANCE} < 2.0" | bc -l) )); then
  echo "⚠️  Low balance. Requesting airdrop..."
  solana airdrop 2 --url "${CLUSTER}" || true
  sleep 3
fi

# ── Build ──────────────────────────────────────────────────────────

echo ""
echo "🔨 Building programs..."
anchor build

echo "✅ Build complete"

# ── Extract program IDs ────────────────────────────────────────────

STABLECOIN_ID=$(solana-keygen pubkey target/deploy/solana_stablecoin-keypair.json 2>/dev/null || echo "")
HOOK_ID=$(solana-keygen pubkey target/deploy/sss_transfer_hook-keypair.json 2>/dev/null || echo "")

if [ -z "$STABLECOIN_ID" ] || [ -z "$HOOK_ID" ]; then
  echo "❌ Could not extract program IDs. Build may have failed."
  exit 1
fi

echo ""
echo "📋 Program IDs:"
echo "   Stablecoin:     ${STABLECOIN_ID}"
echo "   Transfer Hook:  ${HOOK_ID}"

# ── Update declare_id! in source ───────────────────────────────────

echo ""
echo "🔧 Updating program IDs in source..."

# Update stablecoin lib.rs
sed -i "s/declare_id!(\".*\")/declare_id!(\"${STABLECOIN_ID}\")/" programs/stablecoin/src/lib.rs
echo "   ✅ programs/stablecoin/src/lib.rs"

# Update transfer-hook lib.rs
sed -i "s/declare_id!(\".*\")/declare_id!(\"${HOOK_ID}\")/" programs/transfer-hook/src/lib.rs
echo "   ✅ programs/transfer-hook/src/lib.rs"

# Update Anchor.toml
sed -i "s/solana_stablecoin = \".*\"/solana_stablecoin = \"${STABLECOIN_ID}\"/" "${ANCHOR_TOML}"
sed -i "s/sss_transfer_hook = \".*\"/sss_transfer_hook = \"${HOOK_ID}\"/" "${ANCHOR_TOML}"
echo "   ✅ Anchor.toml"

# Update SDK types.ts
SDK_TYPES="sdk/src/types.ts"
if [ -f "$SDK_TYPES" ]; then
  sed -i "s|STABLECOIN_PROGRAM_ID = new PublicKey(.*)|STABLECOIN_PROGRAM_ID = new PublicKey(\"${STABLECOIN_ID}\");|" "$SDK_TYPES"
  sed -i "s|TRANSFER_HOOK_PROGRAM_ID = new PublicKey(.*)|TRANSFER_HOOK_PROGRAM_ID = new PublicKey(\"${HOOK_ID}\");|" "$SDK_TYPES"
  echo "   ✅ sdk/src/types.ts"
fi

# Update .env
ENV_FILE="config/.env"
if [ -f "$ENV_FILE" ]; then
  sed -i "s/STABLECOIN_PROGRAM_ID=.*/STABLECOIN_PROGRAM_ID=${STABLECOIN_ID}/" "$ENV_FILE"
  sed -i "s/TRANSFER_HOOK_PROGRAM_ID=.*/TRANSFER_HOOK_PROGRAM_ID=${HOOK_ID}/" "$ENV_FILE"
  echo "   ✅ config/.env"
fi

# ── Rebuild with updated IDs ──────────────────────────────────────

echo ""
echo "🔨 Rebuilding with updated IDs..."
anchor build

# ── Deploy ─────────────────────────────────────────────────────────

echo ""
echo "🚀 Deploying to ${CLUSTER}..."
anchor deploy --provider.cluster "${CLUSTER}"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Deployment complete!"
echo ""
echo "  Stablecoin Program:    ${STABLECOIN_ID}"
echo "  Transfer Hook Program: ${HOOK_ID}"
echo "  Cluster:               ${CLUSTER}"
echo ""
echo "  Next steps:"
echo "    1. Update IDL:  anchor idl init --filepath target/idl/solana_stablecoin.json ${STABLECOIN_ID} --provider.cluster ${CLUSTER}"
echo "    2. Initialize:  sss-token init --preset sss-1 --name 'My USD' --symbol MUSD"
echo "    3. Run tests:   anchor test --provider.cluster ${CLUSTER}"
echo "═══════════════════════════════════════════════════════════════"
