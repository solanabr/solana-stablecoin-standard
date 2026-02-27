#!/bin/bash
# Terminal Demo Script for SSS Token
# Run: bash scripts/demo.sh

clear
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     SSS Token Demo - Solana Stablecoin Standard             ║"
echo "║     https://github.com/yoiioy700/solana-stablecoin-bounty   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

sleep 1

echo "🏗️  Step 1: Initialize SSS-1 Stablecoin"
echo "───────────────────────────────────────────────────────────────"
echo "$ sss-token init --preset sss-1 --name \"Demo USD\" --symbol DUSD"
sleep 0.8
echo "✓ Stablecoin initialized"
echo "  Mint: DemoToken1111111111111111111111111111111111"
echo "  State: DemoState111111111111111111111111111111111"
echo ""

sleep 1

echo "👤 Step 2: Grant Minter Role"
echo "───────────────────────────────────────────────────────────────"
echo "$ sss-token roles grant-minter 7RDzYmYfq... --quota 1000000"
sleep 0.8
echo "✓ Minter role granted"
echo "  Quota: 1,000,000 tokens"
echo "  Used: 0 tokens"
echo ""

sleep 1

echo "💰 Step 3: Mint Tokens"
echo "───────────────────────────────────────────────────────────────"
echo "$ sss-token mint 7RDzYmYfq... 500000"
sleep 0.8
echo "✓ Minted 500,000 tokens"
echo "  Signature: 5PSnerYeMjaRJXJW..."
echo ""

sleep 1

echo "🔥 Step 4: Burn Tokens"
echo "───────────────────────────────────────────────────────────────"
echo "$ sss-token burn 100000"
sleep 0.8
echo "✓ Burned 100,000 tokens"
echo "  Remaining: 400,000 tokens"
echo ""

sleep 1

echo "🛡️  Step 5: Enable SSS-2 Compliance"
echo "───────────────────────────────────────────────────────────────"
echo "$ sss-token config --enable-transfer-hook --enable-pdelegate"
sleep 0.8
echo "✓ SSS-2 features enabled"
echo "  Transfer Hook: Active"
echo "  Permanent Delegate: Configured"
echo ""

sleep 1

echo "⚠️  Step 6: Blacklist Bad Actor"
echo "───────────────────────────────────────────────────────────────"
echo "$ sss-token blacklist add BadActor1111111111111111111111111111 \"Suspicious activity\""
sleep 0.8
echo "✓ Address blacklisted"
echo "  Reason: Suspicious activity"
echo "  Blocked operations: All transfers"
echo ""

sleep 1

echo "🚨 Step 7: Emergency Pause"
echo "───────────────────────────────────────────────────────────────"
echo "$ sss-token pause --reason \"Investigation\""
sleep 0.8
echo "✓ All operations paused"
echo "  Paused at: 2026-02-23 12:45:00 UTC"
echo ""

sleep 1

echo "💼 Step 8: Seize Assets from Blacklisted Account"
echo "───────────────────────────────────────────────────────────────"
echo "$ sss-token seize BadActor1111111111111111111111111111 --to Treasury1111111111111111111111111111"
sleep 0.8
echo "✓ Assets seized"
echo "  Recovered: 50,000 tokens"
echo "  Transferred to: Treasury111111..."
echo ""

sleep 1

echo "✅ Step 9: Resume Operations"
echo "───────────────────────────────────────────────────────────────"
echo "$ sss-token unpause"
sleep 0.8
echo "✓ Operations resumed"
echo "  Status: ACTIVE"
echo ""

sleep 1

echo "═══════════════════════════════════════════════════════════════"
echo "  ✨ Demo Complete!"
echo ""
echo "  Repository: https://github.com/yoiioy700/solana-stablecoin-bounty"
echo "  Programs: SSS-1 + SSS-2"
echo "  Modules: SolanaStablecoin, ComplianceModule, RoleManager"
echo "═══════════════════════════════════════════════════════════════"
echo ""