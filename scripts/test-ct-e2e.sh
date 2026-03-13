#!/bin/bash
# ───────────────────────────────────────────────────────────────────────────
# SSS-3 Confidential Transfer End-to-End Test
# ───────────────────────────────────────────────────────────────────────────
#
# This script demonstrates the full confidential transfer lifecycle:
#   1. Create SSS-3 stablecoin (ConfidentialTransferMint enabled)
#   2. Mint tokens (public balance)
#   3. Configure token accounts for confidential transfers
#   4. Deposit into encrypted confidential balance
#   5. Apply pending balance
#   6. Confidential transfer between accounts (ZK range proofs)
#   7. Apply recipient's pending balance
#   8. Withdraw from confidential back to public balance
#   9. Verify final balances
#
# Requirements:
#   - solana-test-validator running with Token-2022 that supports CT
#   - spl-token CLI v4+ (with confidential transfer commands)
#   - anchor CLI + built SSS programs deployed to localnet
#
# NOTE: Confidential transfers require the ZK ElGamal proof program,
# which is currently disabled on devnet/mainnet (security audit).
# This script runs on localnet only as a proof-of-concept.
# ───────────────────────────────────────────────────────────────────────────

set -e

PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

check() {
  TOTAL=$((TOTAL + 1))
  local desc="$1"
  local condition="$2"
  if eval "$condition"; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} [${TOTAL}/${EXPECTED_CHECKS}] $desc"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} [${TOTAL}/${EXPECTED_CHECKS}] $desc"
  fi
}

EXPECTED_CHECKS=14

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  SSS-3 Confidential Transfer — End-to-End Proof            ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Step 0: Prerequisites ──────────────────────────────────────────────

echo -e "${CYAN}── Step 0: Prerequisites ──${NC}"

# Check spl-token version
SPL_VERSION=$(spl-token --version 2>/dev/null || echo "not found")
echo "  spl-token version: $SPL_VERSION"

# Check if CT commands are available
if ! spl-token configure-confidential-transfer-account --help >/dev/null 2>&1; then
  echo -e "${RED}ERROR: spl-token does not support confidential transfer commands.${NC}"
  echo "  You need spl-token CLI v4+ with CT support."
  echo "  Install: cargo install spl-token-cli --features confidential-transfer"
  exit 1
fi

# Generate test keypairs
SENDER_KEYPAIR=$(mktemp /tmp/sender-XXXXX.json)
RECIPIENT_KEYPAIR=$(mktemp /tmp/recipient-XXXXX.json)
AUTHORITY_KEYPAIR=$(mktemp /tmp/authority-XXXXX.json)

solana-keygen new --no-passphrase --outfile "$SENDER_KEYPAIR" --force >/dev/null 2>&1
solana-keygen new --no-passphrase --outfile "$RECIPIENT_KEYPAIR" --force >/dev/null 2>&1
solana-keygen new --no-passphrase --outfile "$AUTHORITY_KEYPAIR" --force >/dev/null 2>&1

SENDER=$(solana-keygen pubkey "$SENDER_KEYPAIR")
RECIPIENT=$(solana-keygen pubkey "$RECIPIENT_KEYPAIR")
AUTHORITY=$(solana-keygen pubkey "$AUTHORITY_KEYPAIR")

echo "  Authority:  $AUTHORITY"
echo "  Sender:     $SENDER"
echo "  Recipient:  $RECIPIENT"

# Airdrop SOL for all
echo ""
echo -e "${CYAN}── Airdropping SOL ──${NC}"
solana airdrop 5 "$AUTHORITY" --url localhost >/dev/null 2>&1
solana airdrop 5 "$SENDER" --url localhost >/dev/null 2>&1
solana airdrop 5 "$RECIPIENT" --url localhost >/dev/null 2>&1
echo "  Airdropped 5 SOL to each account"
echo ""

# ── Step 1: Create SSS-3 Stablecoin ───────────────────────────────────

echo -e "${CYAN}── Step 1: Create SSS-3 Stablecoin ──${NC}"

# Create mint with CT extension using spl-token CLI
MINT_OUTPUT=$(spl-token create-token \
  --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb \
  --enable-confidential-transfers auto \
  --decimals 6 \
  --owner "$AUTHORITY_KEYPAIR" \
  --url localhost 2>&1)

# Extract mint address (macOS-compatible)
MINT_ADDRESS=$(echo "$MINT_OUTPUT" | awk '/Creating token/ {print $3}')
if [ -z "$MINT_ADDRESS" ]; then
  MINT_ADDRESS=$(echo "$MINT_OUTPUT" | head -1 | awk '{print $3}')
fi

echo "  Mint: $MINT_ADDRESS"
check "SSS-3 mint created with CT extension" "[ -n '$MINT_ADDRESS' ]"

# Verify CT extension is present
MINT_INFO=$(spl-token display "$MINT_ADDRESS" --url localhost 2>&1 || true)
check "ConfidentialTransferMint extension on mint" "echo '$MINT_INFO' | grep -qi 'confidential'"

echo ""

# ── Step 2: Create Token Accounts ──────────────────────────────────────

echo -e "${CYAN}── Step 2: Create Token Accounts ──${NC}"

# Extract account address using awk (macOS-compatible)
SENDER_CREATE_OUT=$(spl-token create-account "$MINT_ADDRESS" \
  --owner "$SENDER_KEYPAIR" \
  --url localhost 2>&1)
SENDER_ATA=$(echo "$SENDER_CREATE_OUT" | awk '/Creating account/ {print $3}')

RECIPIENT_CREATE_OUT=$(spl-token create-account "$MINT_ADDRESS" \
  --owner "$RECIPIENT_KEYPAIR" \
  --url localhost 2>&1)
RECIPIENT_ATA=$(echo "$RECIPIENT_CREATE_OUT" | awk '/Creating account/ {print $3}')

echo "  Sender ATA:    $SENDER_ATA"
echo "  Recipient ATA: $RECIPIENT_ATA"
check "Token accounts created" "[ -n '$SENDER_ATA' ] && [ -n '$RECIPIENT_ATA' ]"

echo ""

# ── Step 3: Mint Tokens (Public Balance) ───────────────────────────────

echo -e "${CYAN}── Step 3: Mint 1000 Tokens ──${NC}"

spl-token mint "$MINT_ADDRESS" 1000 "$SENDER_ATA" \
  --mint-authority "$AUTHORITY_KEYPAIR" \
  --url localhost >/dev/null 2>&1

SENDER_BALANCE=$(spl-token balance "$MINT_ADDRESS" --owner "$SENDER" --url localhost 2>&1 | awk '{print $1}')
echo "  Sender public balance: $SENDER_BALANCE"
check "1000 tokens minted to sender" "echo '$SENDER_BALANCE' | grep -q '1000'"

echo ""

# ── Step 4: Configure Accounts for Confidential Transfers ──────────────

echo -e "${CYAN}── Step 4: Configure CT on Token Accounts ──${NC}"

# Configure sender's account for CT (generates ElGamal keypair)
CT_SENDER_OUT=$(spl-token configure-confidential-transfer-account \
  --address "$SENDER_ATA" \
  --owner "$SENDER_KEYPAIR" \
  --url localhost 2>&1 || true)

echo "  Sender CT: $CT_SENDER_OUT"
check "Sender account configured for CT" "echo '$CT_SENDER_OUT' | grep -qiv 'error'"

# Configure recipient's account for CT
CT_RECIP_OUT=$(spl-token configure-confidential-transfer-account \
  --address "$RECIPIENT_ATA" \
  --owner "$RECIPIENT_KEYPAIR" \
  --url localhost 2>&1 || true)

echo "  Recipient CT: $CT_RECIP_OUT"
check "Recipient account configured for CT" "echo '$CT_RECIP_OUT' | grep -qiv 'error'"

echo ""

# ── Step 5: Deposit Tokens into Confidential Balance ───────────────────

echo -e "${CYAN}── Step 5: Deposit 500 Tokens into Confidential Balance ──${NC}"

DEPOSIT_OUT=$(spl-token deposit-confidential-tokens "$MINT_ADDRESS" 500 \
  --address "$SENDER_ATA" \
  --owner "$SENDER_KEYPAIR" \
  --url localhost 2>&1 || true)

echo "  Deposit: $DEPOSIT_OUT"

SENDER_PUBLIC=$(spl-token balance "$MINT_ADDRESS" --owner "$SENDER" --url localhost 2>&1 | awk '{print $1}')
echo "  Sender public balance after deposit: $SENDER_PUBLIC"
check "500 tokens deposited to confidential balance" "echo '$SENDER_PUBLIC' | grep -q '500'"

echo ""

# ── Step 6: Apply Pending Balance ──────────────────────────────────────

echo -e "${CYAN}── Step 6: Apply Pending Balance ──${NC}"

APPLY_OUT=$(spl-token apply-pending-balance \
  --address "$SENDER_ATA" \
  --owner "$SENDER_KEYPAIR" \
  --url localhost 2>&1 || true)

echo "  Apply: $APPLY_OUT"
check "Pending balance applied (available for transfer)" "echo '$APPLY_OUT' | grep -qiv 'error'"

echo ""

# ── Step 7: Confidential Transfer ──────────────────────────────────────

echo -e "${CYAN}── Step 7: Confidential Transfer (200 tokens) ──${NC}"
echo "  Generating ZK range proofs (client-side)..."

CT_TX=$(spl-token transfer "$MINT_ADDRESS" 200 "$RECIPIENT_ATA" \
  --from "$SENDER_ATA" \
  --owner "$SENDER_KEYPAIR" \
  --confidential \
  --url localhost 2>&1 || echo "CT_TRANSFER_FAILED")

echo "  Transfer result: $CT_TX"
check "Confidential transfer of 200 tokens" "! echo '$CT_TX' | grep -qi 'CT_TRANSFER_FAILED\|error'"

echo ""

# ── Step 8: Apply Recipient's Pending Balance ──────────────────────────

echo -e "${CYAN}── Step 8: Apply Recipient's Pending Balance ──${NC}"

APPLY_RECIP_OUT=$(spl-token apply-pending-balance \
  --address "$RECIPIENT_ATA" \
  --owner "$RECIPIENT_KEYPAIR" \
  --url localhost 2>&1 || true)

echo "  Apply: $APPLY_RECIP_OUT"
check "Recipient pending balance applied" "echo '$APPLY_RECIP_OUT' | grep -qiv 'error'"

echo ""

# ── Step 9: Withdraw from Confidential Balance ─────────────────────────

echo -e "${CYAN}── Step 9: Withdraw 100 Tokens from Confidential Balance ──${NC}"

WITHDRAW_OUT=$(spl-token withdraw-confidential-tokens "$MINT_ADDRESS" 100 \
  --address "$RECIPIENT_ATA" \
  --owner "$RECIPIENT_KEYPAIR" \
  --url localhost 2>&1 || true)

echo "  Withdraw: $WITHDRAW_OUT"

RECIPIENT_PUBLIC=$(spl-token balance "$MINT_ADDRESS" --owner "$RECIPIENT" --url localhost 2>&1 | awk '{print $1}')
echo "  Recipient public balance after withdrawal: $RECIPIENT_PUBLIC"
check "100 tokens withdrawn from confidential to public" "echo '$RECIPIENT_PUBLIC' | grep -q '100'"

echo ""

# ── Step 10: Final Balance Verification ────────────────────────────────

echo -e "${CYAN}── Step 10: Final Balance Verification ──${NC}"

FINAL_SENDER=$(spl-token balance "$MINT_ADDRESS" --owner "$SENDER" --url localhost 2>&1 | awk '{print $1}')
FINAL_RECIPIENT=$(spl-token balance "$MINT_ADDRESS" --owner "$RECIPIENT" --url localhost 2>&1 | awk '{print $1}')

echo "  Sender public balance:    $FINAL_SENDER (expected: 500)"
echo "  Recipient public balance: $FINAL_RECIPIENT (expected: 100)"
echo "  Note: Remaining confidential balances are encrypted on-chain"

check "Sender public balance = 500" "echo '$FINAL_SENDER' | grep -q '500'"
check "Recipient has public tokens" "[ -n '$FINAL_RECIPIENT' ] && [ '$FINAL_RECIPIENT' != '0' ]"

echo ""

# ── Summary ────────────────────────────────────────────────────────────

echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Results                                                    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC} $PASS/$TOTAL"
if [ $FAIL -gt 0 ]; then
  echo -e "  ${RED}Failed:${NC} $FAIL/$TOTAL"
fi
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  ✓ All $TOTAL checks passed — SSS-3 Confidential Transfers verified!${NC}"
else
  echo -e "${YELLOW}${BOLD}  ⚠ $FAIL check(s) failed — see output above for details.${NC}"
  echo "  Note: CT requires Token-2022 with zk-ops enabled."
  echo "  If using a standard validator, some CT operations may not be available."
fi
echo ""

# Cleanup
rm -f "$SENDER_KEYPAIR" "$RECIPIENT_KEYPAIR" "$AUTHORITY_KEYPAIR"

# Save proof log
PROOF_LOG="evidence/ct-e2e-proof.log"
mkdir -p evidence
{
  echo "SSS-3 Confidential Transfer E2E — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "Passed: $PASS/$TOTAL"
  echo "Failed: $FAIL/$TOTAL"
  echo "Mint: $MINT_ADDRESS"
  echo "Sender: $SENDER"
  echo "Recipient: $RECIPIENT"
} > "$PROOF_LOG"

exit $FAIL
