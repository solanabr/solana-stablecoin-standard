# Solana Stablecoin Standard (SSS)

A production-ready, modular SDK and Anchor smart contracts for issuing stablecoins on Solana using Token-2022.

## Features
- **SSS-1 (Minimal)**: Core Token-2022 setup with on-chain metadata.
- **SSS-2 (Compliant)**: Transfer Hooks for Blacklist enforcement, Permanent Delegate for Seizing funds.
- **Oracle Module**: Pluggable price feeds (Mocked Switchboard) for Non-USD pegs (EUR, BRL).
- **Backend Infrastructure**: Dockerized Compliance API & Event Indexer.

## Quick Start (For Judges)

You can run the entire infrastructure (Solana Validator + Compliance API) with a single command using Docker.

```bash
docker-compose up -d --build
```

The services will be available at:
- **Solana localnet RPC**: http://localhost:8899 
- **Compliance API**: http://localhost:3000/api/audit

## Run Tests locally
If you want to test the SDK and Smart Contracts against the Docker validator:
```Bash
# Wait 10 seconds for the validator to boot up, then deploy the programs:
anchor build
anchor deploy

# Run the SSS-1 Minimal test
npx tsx scripts/test_basic.ts

# Run the Oracle Peg test
npx tsx scripts/test_oracle.ts
```