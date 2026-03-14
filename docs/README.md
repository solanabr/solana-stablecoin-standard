# SSS Documentation Index

## Overview
Solana Stablecoin Standard (SSS) is a modular Token-2022 architecture with two production presets:
- **SSS-1**: minimal issuance and lifecycle controls.
- **SSS-2**: compliance preset with transfer hook blacklist + permanent delegate seizure.

## Quick Start
1. Build and deploy programs:
   ```bash
   anchor build
   anchor deploy
   ```
2. Run basic integration flow:
   ```bash
   npx tsx scripts/test_basic.ts
   ```
3. Run backend stack:
   ```bash
   docker-compose up -d
   ```

## Preset Comparison
| Capability | SSS-1 | SSS-2 |
|---|---:|---:|
| Token-2022 mint lifecycle | ✅ | ✅ |
| Blacklist transfer control | ❌ | ✅ |
| Seizure via permanent delegate | ❌ | ✅ |
| Oracle pegging support | ✅ | ✅ |

## Contents
- `ARCHITECTURE.md`
- `OPERATIONS.md`
- `SSS-1.md`
- `SSS-2.md`
- `SECURITY.md`
