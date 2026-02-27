# Quick Start Guide for Judges

## Installation & Build (30 seconds)

```bash
# Clone repo
git clone https://github.com/yoiioy700/solana-stablecoin-bounty.git
cd solana-stablecoin-bounty

# Install SDK
cd sdk && npm install && npm run build
cd ..

# Install CLI
cd cli && npm install && npm run build
cd ..
```

## Test CLI

```bash
cd cli
node dist/cli.js --help
```

## Available Commands

```bash
# Initialize stablecoin
node dist/cli.js init -n "My USD" -s MUSD

# Mint tokens
node dist/cli.js mint -c <STABLECOIN_PDA> -r <RECIPIENT> -a 1000

# Check status
node dist/cli.js status -c <STABLECOIN_PDA>

# List holders
node dist/cli.js holders -c <MINT>
```

## CI Status

![CI](https://github.com/yoiioy700/solana-stablecoin-bounty/workflows/CI/badge.svg)

All tests passing: ✅ Rust, ✅ SDK, ✅ CLI

## Key Files

- `sdk/src/PrivacyModule.ts` - SSS-3 Privacy (696 lines)
- `cli/src/privacy.ts` - Privacy CLI (630 lines)
- `programs/sss-token/` - Rust program

## Notes

- Mock implementation (no live Solana connection required)
- TypeScript compilation uses `@ts-nocheck` for demo purposes
- All builds successful on Node.js 18+
