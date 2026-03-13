# Solana Stablecoin Standard (SSS)

A production-grade modular stablecoin issuance framework for Solana.

## Overview

The Solana Stablecoin Standard (SSS) provides a composable, institutional-grade architecture for deploying stablecoins on Solana. It leverages Token-2022 extensions to enforce strict monetary invariants while providing a flexible policy plane via configurable presets (`SSS-1` and `SSS-2`).

## Architecture

This repository is divided strictly into four planes:
1. **Monetary Core** (Anchor program core registers & state machines)
2. **Policy Plane** (Compliance modules and Transfer Hooks)
3. **Execution Plane** (TypeScript SDK & Token execution wiring)
4. **Operations Plane** (Operator CLI & Backend Microservices)

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for deeper details.

## Quick Start (Institutional Cluster - Single Command)

To spin up the entire ecosystem (Solana Validator, Anchor Program Deployment, PostgreSQL, Indexer, Orchestrator, and Institutional Frontend) with one command:

```bash
make up
```

*To tear down the cluster and clean volumes, run `make down`.*

## Quick Start (Operator CLI)

```bash
make build
cd cli
npm link
```

Initialize an SSS-2 Compliant standard:
```bash
sss-token init --preset sss-2
sss-token mint <treasury-address> 1000000
sss-token blacklist add <address> --reason "OFAC match"
sss-token freeze <address>
```

## Supported Standards
* **SSS-1 (Minimal Stablecoin):** Built for DAO treasuries or internal tokens. Features roles and freeze caps.
* **SSS-2 (Compliant Stablecoin):** Built for regulated entities. Operates a Permanent Delegate, Transfer Hooks, and strict Blacklist constraints.

## Developer Quick Start

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

// Deploy SSS-2
const stable = await SolanaStablecoin.create(connection, program, {
  preset: Presets.SSS_2,
  authority: adminKeypair
}, baseTokenDetails);

await stable.compliance.blacklistAdd(maliciousAddress, "Sanctions hit");
```

## Institutional Frontend

A React + Vite dashboard is included for visual management of roles, quotas, and compliance.

### Setup
```bash
cd apps/frontend
npm install
npm run dev
```

The frontend connects to the backend services (Indexer/Orchestrator) to provide a real-time audit trail and coordination for fiat-to-token operations.


## Security & Architecture Documentation

The Solana Stablecoin Standard is designed as a production-grade infrastructure reference. 

Detailed documentation is available:

*   **[SECURITY_MODEL.md](./docs/SECURITY_MODEL.md)**: RBAC assumptions, trust boundaries, and known threat mitigation paths.
*   **[THREAT_MODEL.md](./docs/THREAT_MODEL.md)**: Formal adversarial analysis and mitigation strategies.
*   **[STATE_MACHINE.md](./docs/STATE_MACHINES.md)**: Deterministic protocol and account state transition specifications.
*   **[INVARIANTS.md](./docs/MONETARY_INVARIANTS.md)**: Core monetary and compliance invariant enforcement logic.
*   **[SELF_AUDIT.md](./docs/SELF_AUDIT.md)**: Internal security analysis, design risks, and known limitations.
*   **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)**: Detailed system blueprints and interaction diagrams.
*   **[DEVNET_DEPLOYMENT.md](./docs/DEVNET_DEPLOYMENT.md)**: Step-by-step guide for on-chain verification.
*   **[FUZZ_TESTING.md](./docs/FUZZ_TESTING.md)**: Stateful property-based testing strategy using Trident.
*   **[FORMAL_VERIFICATION.md](./docs/FORMAL_VERIFICATION.md)**: Mathematical specification of protocol invariants and state machine safety.
