#!/usr/bin/env bash
# Close deployed stablecoin and transfer-hook programs and reclaim rent to the upgrade authority.
# Requires the deploy keypair (default: ~/.config/solana/id.json) to be the upgrade authority.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STABLECOIN_ID="C7k7FTRLGLB5FJS7hWrpjqRiwmj5Px9DzMQUeouAxJ9r"
TRANSFER_HOOK_ID="YYTBExpcbtVYTGNmbgcAr7SzEGWfLtByYUrcfzvUz8p"

RPC_URL="${SOLANA_RPC_URL:-${SSS_RPC_URL:-https://api.devnet.solana.com}}"
KEYPAIR="${SOLANA_KEYPAIR:-$HOME/.config/solana/id.json}"

echo "Closing programs on devnet (RPC: ${RPC_URL})"
echo "Upgrade authority keypair: ${KEYPAIR}"
echo ""

# Close transfer-hook first, then stablecoin
for PROGRAM_ID in "$TRANSFER_HOOK_ID" "$STABLECOIN_ID"; do
  echo "Closing program ${PROGRAM_ID}..."
  solana program close "$PROGRAM_ID" \
    --url "$RPC_URL" \
    --keypair "$KEYPAIR" \
    --bypass-warning
  echo "Closed. Rent reclaimed."
  echo ""
done

echo "Done. All program rent reclaimed to $(solana address -k "$KEYPAIR")."
