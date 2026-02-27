#!/bin/bash

# Test runner for SSS Token

echo "═══════════════════════════════════════════"
echo "SSS Token Test Suite"
echo "═══════════════════════════════════════════"

# Check if dependencies installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Run SSS-1 tests
echo ""
echo "Running SSS-1 Tests..."
npx mocha -r ts-node/register tests/sss-1/*.test.ts --timeout 60000

# Run SSS-2 tests
echo ""
echo "Running SSS-2 Tests..."
npx mocha -r ts-node/register tests/sss-2/*.test.ts --timeout 60000

# Summary
echo ""
echo "═══════════════════════════════════════════"
echo "Test Suite Complete"
echo "═══════════════════════════════════════════"
