#!/bin/bash
set -e

echo "============================================"
echo "  Solana Stablecoin Standard — Full Demo"
echo "  Running on Surfpool Localnet"
echo "============================================"
echo ""

echo "--- Checking Surfpool is running ---"
solana cluster-version >/dev/null 2>&1 || { echo "ERROR: Surfpool not running. Start it first."; exit 1; }

echo "--- Checking Cloak relay is running ---"
if ! curl -sf "${CLOAK_RELAY_URL:-http://localhost:5500}/health" >/dev/null 2>&1; then
  echo "WARNING: Cloak relay not detected. SSS-3 demo will still run with connectivity diagnostics."
fi

echo ""
echo ">>> Running SSS-1 Demo..."
npx ts-node scripts/demo-sss1.ts
echo ""

echo ">>> Running SSS-2 Demo..."
npx ts-node scripts/demo-sss2.ts
echo ""

echo ">>> Running Cloak Health Check..."
npx ts-node scripts/demo-cloak.ts
echo ""

echo ">>> Running SSS-3 Privacy Demo..."
npx ts-node scripts/demo-sss3.ts
echo ""

echo "============================================"
echo "  All demos complete."
echo "  Record this terminal output for the video!"
echo "============================================"
