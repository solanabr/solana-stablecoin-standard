#!/bin/bash
# SSS program ID updater: reads pubkey from wallets/program-keypair.json and updates
# declare_id! in the target program's lib.rs and the matching entry in Anchor.toml.
#
# Paths touched:
#   - programs/sss-1/src/lib.rs  (when PROG=sss-1)
#   - programs/sss-2/src/lib.rs  (when PROG=sss-2)
#   - Anchor.toml (root)
#
# Usage: ./scripts/upgrade-program-id.sh [sss-1|sss-2]
# Default: sss-1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

PROG="${1:-sss-1}"
if [ "$PROG" != "sss-1" ] && [ "$PROG" != "sss-2" ]; then
  echo "Usage: $0 [sss-1|sss-2]"
  echo "  sss-1 = main SSS token program (programs/sss-1)"
  echo "  sss-2 = transfer hook program (programs/sss-2)"
  exit 1
fi

KEYPAIR_PATH="$ROOT_DIR/wallets/program-keypair.json"
if [ ! -f "$KEYPAIR_PATH" ]; then
  echo "Error: $KEYPAIR_PATH not found"
  echo "Place your program keypair at wallets/program-keypair.json (e.g. solana-keygen new -o wallets/program-keypair.json)"
  exit 1
fi

PUBKEY=$(solana-keygen pubkey "$KEYPAIR_PATH")
echo "Program ID: $PUBKEY (updating $PROG)"

# sed in-place: macOS needs '' after -i, Linux does not
if sed --version 2>/dev/null | grep -q GNU; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i '')
fi

LIB_RS="$ROOT_DIR/programs/$PROG/src/lib.rs"
if [ ! -f "$LIB_RS" ]; then
  echo "Error: $LIB_RS not found"
  exit 1
fi
sed "${SED_INPLACE[@]}" "s/declare_id!(\"[^\"]*\")/declare_id!(\"$PUBKEY\")/" "$LIB_RS"
echo "Updated $LIB_RS"

ANCHOR_TOML="$ROOT_DIR/Anchor.toml"
# Anchor.toml uses sss_1 / sss_2 (underscore)
ANCHOR_KEY="${PROG/-/_}"
sed "${SED_INPLACE[@]}" "s/${ANCHOR_KEY} = \"[^\"]*\"/${ANCHOR_KEY} = \"$PUBKEY\"/" "$ANCHOR_TOML"
echo "Updated $ANCHOR_TOML"

echo "Done. Run 'anchor build' to rebuild with the new program ID."
