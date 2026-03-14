---
sidebar_position: 9
title: Deployment
description: Deployment model for development, staging, and production
---

# Deployment

This guide covers deployment across local, staging, and production environments.

## Environment Strategy

Use environment parity where possible:

- Local: developer validation
- Staging: pre-production rehearsals and policy tests
- Production: controlled rollout with monitored change windows

## Build and Verification

```bash
npm run build:all
```

Verify Docker services:

```bash
npm run docker:build
npm run docker:up
```

## Railway Deployment Model

Deploy each service independently:

- `backend`
- `frontend`
- `docs`

Recommended sequence:

1. Deploy backend and confirm health endpoint.
2. Deploy frontend with backend URL configured.
3. Deploy docs and verify navigation.

## Required Environment Variables

Backend:

- `NODE_ENV`
- `SOLANA_RPC_URL`
- `SOLANA_NETWORK`
- `SSS_PROGRAM_ID`
- `CORS_ORIGIN`

Frontend:

- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_SSS_PROGRAM_ID`
- `NEXT_PUBLIC_API_URL`

## Production Readiness Checks

- Program IDs and RPC endpoints verified.
- Authority custody confirmed.
- Alerting and incident channels active.
- Change rollback procedure tested.

## Next Step

Move to [Operations Runbook](./operations-runbook).
