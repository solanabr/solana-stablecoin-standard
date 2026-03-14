---
sidebar_position: 2
title: Getting Started
description: Environment setup and prerequisites for SSS
---

# Getting Started

This guide covers the minimum environment and repository setup required to work with SSS locally.

## Prerequisites

Install the following tooling:

- Rust (stable channel)
- Solana CLI (matching project requirement)
- Anchor CLI
- Node.js 20+
- Docker (recommended for service validation)

## Repository Setup

```bash
git clone https://github.com/Rahul-Prasad-07/solana-stablecoin-standard.git
cd solana-stablecoin-standard
npm install
```

Install package dependencies for all modules:

```bash
npm run install:all
```

## Solana Configuration

Use devnet for local development and testing:

```bash
solana config set --url https://api.devnet.solana.com
solana-keygen new -o ~/.config/solana/devnet.json
solana config set --keypair ~/.config/solana/devnet.json
solana airdrop 2
```

## Build Validation

Verify all project modules compile:

```bash
npm run build:all
```

Expected outputs include successful builds for `sdk`, `cli`, `backend`, `frontend`, and `website`.

## Local Runtime Validation

Start full stack locally using Docker:

```bash
npm run docker:build
npm run docker:up
```

Check service health:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001/api/v1/health`
- Docs: `http://localhost:3002`

## Next Step

Continue with [Quickstart](./quickstart) to initialize a stablecoin and perform core operations.
