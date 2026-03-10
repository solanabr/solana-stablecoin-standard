#!/usr/bin/env bash
#
# setup-local.sh -- Bootstrap a local development environment for SSS.
#
# Usage:
#   ./scripts/setup-local.sh            Build programs and start validator
#   ./scripts/setup-local.sh --seed     Also seed test data after validator starts
#
# What this script does:
#   1. Checks that required tools are installed (Rust, Solana CLI, Anchor, Node, Yarn)
#   2. Installs JS dependencies at the repo root and in sdk/
#   3. Generates a local keypair if one does not exist
#   4. Builds Anchor programs
#   5. Starts solana-test-validator with the built programs pre-deployed
#   6. Optionally seeds test data (--seed)
#
# To stop the validator, press Ctrl-C or run: solana-test-validator --kill
# ---------------------------------------------------------------------------

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── Colours ─────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  CYAN='\033[0;36m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' CYAN='' NC=''
fi

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }

# ── Parse flags ─────────────────────────────────────────────────────────────
SEED=false

for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    -h|--help)
      echo "Usage: $0 [--seed]"
      echo ""
      echo "  --seed   Seed test data after the validator starts"
      exit 0
      ;;
    *)
      error "Unknown argument: $arg"
      echo "Usage: $0 [--seed]"
      exit 1
      ;;
  esac
done

# ── Step 1: Check prerequisites ────────────────────────────────────────────
info "Checking prerequisites..."

MISSING=()

command -v rustc   &>/dev/null || MISSING+=("rustc (https://rustup.rs)")
command -v cargo   &>/dev/null || MISSING+=("cargo (https://rustup.rs)")
command -v solana  &>/dev/null || MISSING+=("solana (https://docs.anza.xyz/cli/install)")
command -v anchor  &>/dev/null || MISSING+=("anchor (npm i -g @coral-xyz/anchor-cli)")
command -v node    &>/dev/null || MISSING+=("node (https://nodejs.org)")
command -v yarn    &>/dev/null || MISSING+=("yarn (npm i -g yarn)")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  error "The following tools are missing:"
  for tool in "${MISSING[@]}"; do
    echo "  - $tool"
  done
  exit 1
fi

ok "All prerequisites found."
echo "  rustc  : $(rustc --version)"
echo "  solana : $(solana --version)"
echo "  anchor : $(anchor --version)"
echo "  node   : $(node --version)"
echo "  yarn   : $(yarn --version)"

# ── Step 2: Install JS dependencies ────────────────────────────────────────
info "Installing root JS dependencies..."
yarn install
ok "Root dependencies installed."

info "Installing SDK dependencies..."
(cd sdk && yarn install)
ok "SDK dependencies installed."

# ── Step 3: Ensure a local keypair exists ───────────────────────────────────
KEYPAIR_PATH="$HOME/.config/solana/id.json"
if [[ ! -f "$KEYPAIR_PATH" ]]; then
  info "No local keypair found -- generating one..."
  solana-keygen new --no-bip39-passphrase --silent
  ok "Keypair created at $KEYPAIR_PATH"
else
  ok "Local keypair already exists at $KEYPAIR_PATH"
fi

# Point Solana CLI at localhost
solana config set --url localhost >/dev/null 2>&1

# ── Step 4: Build Anchor programs ──────────────────────────────────────────
info "Building Anchor programs..."
anchor build
ok "Programs built successfully."

# ── Step 5: Start solana-test-validator ─────────────────────────────────────
# Read program IDs from the build keypairs
CORE_PROGRAM_ID=$(solana-keygen pubkey target/deploy/sss_core-keypair.json 2>/dev/null || echo "")
HOOK_PROGRAM_ID=$(solana-keygen pubkey target/deploy/sss_hook-keypair.json 2>/dev/null || echo "")

VALIDATOR_ARGS=("--reset")

if [[ -n "$CORE_PROGRAM_ID" && -f "target/deploy/sss_core.so" ]]; then
  VALIDATOR_ARGS+=("--bpf-program" "$CORE_PROGRAM_ID" "target/deploy/sss_core.so")
  info "Will deploy sss-core ($CORE_PROGRAM_ID)"
fi

if [[ -n "$HOOK_PROGRAM_ID" && -f "target/deploy/sss_hook.so" ]]; then
  VALIDATOR_ARGS+=("--bpf-program" "$HOOK_PROGRAM_ID" "target/deploy/sss_hook.so")
  info "Will deploy sss-hook ($HOOK_PROGRAM_ID)"
fi

info "Starting solana-test-validator..."
solana-test-validator "${VALIDATOR_ARGS[@]}" &
VALIDATOR_PID=$!

# Give the validator a moment to boot
sleep 3

# Verify validator is running
if ! kill -0 "$VALIDATOR_PID" 2>/dev/null; then
  error "solana-test-validator failed to start."
  exit 1
fi
ok "Validator running (PID $VALIDATOR_PID)."

# Airdrop SOL to the local keypair for testing
info "Airdropping 100 SOL to local wallet..."
solana airdrop 100 >/dev/null 2>&1 || warn "Airdrop failed -- validator may still be booting."

# ── Step 6 (optional): Seed test data ──────────────────────────────────────
if [[ "$SEED" == "true" ]]; then
  info "Seeding test data..."

  # Check for a seed script in the project
  if [[ -f "scripts/seed.ts" ]]; then
    npx ts-node scripts/seed.ts
    ok "Test data seeded via scripts/seed.ts"
  elif [[ -f "tests/seed.ts" ]]; then
    npx ts-node tests/seed.ts
    ok "Test data seeded via tests/seed.ts"
  else
    warn "No seed script found (looked for scripts/seed.ts, tests/seed.ts)."
    warn "Create one to auto-seed test data on setup."
  fi
fi

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "============================================="
echo "  Local Environment Ready"
echo "============================================="
echo "  Validator PID :  $VALIDATOR_PID"
echo "  RPC URL       :  http://localhost:8899"
echo "  sss-core      :  ${CORE_PROGRAM_ID:-unknown}"
echo "  sss-hook      :  ${HOOK_PROGRAM_ID:-unknown}"
echo "============================================="
echo ""
info "Press Ctrl-C to stop the validator."

# Wait for the validator so Ctrl-C terminates cleanly
wait "$VALIDATOR_PID"
