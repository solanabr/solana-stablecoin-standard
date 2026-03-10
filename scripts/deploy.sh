#!/usr/bin/env bash
#
# deploy.sh -- Deploy SSS programs to Solana devnet or mainnet-beta.
#
# Usage:
#   ./scripts/deploy.sh <cluster>            Deploy to the given cluster
#   ./scripts/deploy.sh <cluster> --dry-run  Build only, print what would be deployed
#
# Clusters:
#   devnet        Solana devnet
#   mainnet-beta  Solana mainnet-beta
#
# Prerequisites:
#   - solana CLI installed and on PATH
#   - anchor CLI installed and on PATH
#   - A funded deployer keypair configured via `solana config set --keypair <path>`
#
# The script deploys sss-core first, then sss-hook, because sss-hook may
# depend on sss-core's program ID at runtime.
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Colours (disabled when stdout is not a terminal) ─────────────────────────
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

# ── Parse arguments ─────────────────────────────────────────────────────────
DRY_RUN=false
CLUSTER=""

for arg in "$@"; do
  case "$arg" in
    --dry-run)  DRY_RUN=true ;;
    devnet|mainnet-beta) CLUSTER="$arg" ;;
    *)
      error "Unknown argument: $arg"
      echo "Usage: $0 <devnet|mainnet-beta> [--dry-run]"
      exit 1
      ;;
  esac
done

if [[ -z "$CLUSTER" ]]; then
  error "Cluster argument is required."
  echo "Usage: $0 <devnet|mainnet-beta> [--dry-run]"
  exit 1
fi

# ── Safety check for mainnet ────────────────────────────────────────────────
if [[ "$CLUSTER" == "mainnet-beta" && "$DRY_RUN" == "false" ]]; then
  warn "You are about to deploy to MAINNET-BETA."
  read -rp "Type 'yes' to continue: " confirm
  if [[ "$confirm" != "yes" ]]; then
    info "Deployment aborted."
    exit 0
  fi
fi

# ── Prerequisite checks ────────────────────────────────────────────────────
info "Checking prerequisites..."

if ! command -v solana &>/dev/null; then
  error "solana CLI not found. Install it: https://docs.anza.xyz/cli/install"
  exit 1
fi

if ! command -v anchor &>/dev/null; then
  error "anchor CLI not found. Install it: npm i -g @coral-xyz/anchor-cli"
  exit 1
fi

# Verify a keypair is configured
KEYPAIR_PATH=$(solana config get keypair | awk '{print $NF}')
if [[ ! -f "$KEYPAIR_PATH" ]]; then
  error "No deployer keypair found at $KEYPAIR_PATH"
  error "Set one with: solana config set --keypair <path-to-keypair.json>"
  exit 1
fi

DEPLOYER=$(solana address)
info "Deployer:  $DEPLOYER"
info "Cluster:   $CLUSTER"
info "Keypair:   $KEYPAIR_PATH"

# Show balance so the deployer knows if the account is funded
BALANCE=$(solana balance --url "$CLUSTER" 2>/dev/null || echo "unknown")
info "Balance:   $BALANCE"

# ── Configure Solana CLI for the target cluster ─────────────────────────────
solana config set --url "$CLUSTER" >/dev/null 2>&1

# ── Build programs ──────────────────────────────────────────────────────────
info "Building programs with Anchor..."
anchor build

ok "Build complete."

# ── Locate built artifacts ──────────────────────────────────────────────────
CORE_SO="target/deploy/sss_core.so"
HOOK_SO="target/deploy/sss_hook.so"

for so in "$CORE_SO" "$HOOK_SO"; do
  if [[ ! -f "$so" ]]; then
    error "Expected artifact not found: $so"
    exit 1
  fi
done

# Read declared program IDs from the build
CORE_PROGRAM_ID=$(solana-keygen pubkey target/deploy/sss_core-keypair.json 2>/dev/null || echo "unknown")
HOOK_PROGRAM_ID=$(solana-keygen pubkey target/deploy/sss_hook-keypair.json 2>/dev/null || echo "unknown")

info "sss-core program ID: $CORE_PROGRAM_ID"
info "sss-hook program ID: $HOOK_PROGRAM_ID"

# ── Dry-run exit ────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == "true" ]]; then
  warn "Dry-run mode -- skipping deployment."
  echo ""
  echo "Would deploy to $CLUSTER:"
  echo "  sss-core  ->  $CORE_PROGRAM_ID  ($CORE_SO)"
  echo "  sss-hook  ->  $HOOK_PROGRAM_ID  ($HOOK_SO)"
  exit 0
fi

# ── Deploy sss-core ────────────────────────────────────────────────────────
info "Deploying sss-core to $CLUSTER..."
anchor deploy --program-name sss_core --provider.cluster "$CLUSTER"
ok "sss-core deployed."

# ── Deploy sss-hook ────────────────────────────────────────────────────────
info "Deploying sss-hook to $CLUSTER..."
anchor deploy --program-name sss_hook --provider.cluster "$CLUSTER"
ok "sss-hook deployed."

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "============================================="
echo "  Deployment Summary ($CLUSTER)"
echo "============================================="
echo "  sss-core:  $CORE_PROGRAM_ID"
echo "  sss-hook:  $HOOK_PROGRAM_ID"
echo "  Deployer:  $DEPLOYER"
echo "============================================="
echo ""
ok "All programs deployed successfully."
