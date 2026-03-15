---
id: intro
title: What Is SSS?
slug: /
sidebar_position: 1
description: Solana Stablecoin Standard is a Token-2022 framework for issuing stablecoins with role-based controls, reserve attestations, and optional transfer-hook enforcement.
---

# Solana Stablecoin Standard

Solana Stablecoin Standard, or SSS, is a Token-2022 framework for launching stablecoins on Solana with a clean split between on-chain controls and operator tooling.

It combines:

- `sss-token`, the core program for minting, burning, freezing, role management, blacklisting, seizure, and reserve attestations
- `sss-transfer-hook`, the optional Token-2022 transfer hook used by SSS-2 mints
- a TypeScript SDK published as `solana-stablecoin-standard@0.2.1`
- a TUI admin console, backend API, and web frontend for issuer operations

## Why It Exists

SSS is built for issuers who need more than a plain SPL token. The design targets the kinds of controls discussed in U.S. stablecoin proposals such as the GENIUS Act and the STABLE Act:

- explicit mint and burn authority
- role-separated operational controls
- reserve attestation records
- sanctions response and blacklist enforcement
- emergency pause and freeze flows

SSS is infrastructure, not legal compliance by itself. It gives an issuer verifiable on-chain primitives that a legal, compliance, and finance stack can build around.

## Preset Model

SSS uses preset-driven mint initialization:

| Preset | Intended use | Key features |
| --- | --- | --- |
| `SSS1` | Minimal stablecoins | Mint, burn, freeze, thaw, pause, reserve attestations |
| `SSS2` | Compliance-heavy stablecoins | `SSS1` plus permanent delegate, transfer hook, blacklist, seize |
| `SSS3` | Privacy-oriented stablecoins | `SSS1` plus permanent delegate and confidential transfer mint extension |
| `Custom` | Advanced operators | Explicit feature flags at initialization time |

## Core Components

### Programs

- `sss-token`: `5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4`
- `sss-transfer-hook`: `FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy`

### Token-2022 Extensions

Depending on the preset, SSS initializes:

- `MetadataPointer`
- `PermanentDelegate`
- `TransferHook`
- `DefaultAccountState`
- `ConfidentialTransferMint`

## What You Can Build

- issuer-admin stablecoins with quota-based minters
- compliant payment tokens with blacklist and seizure controls
- reserve-backed assets with immutable attestation history
- operational dashboards that parse on-chain events with the SDK

## Read This Site In Order

1. [Quickstart](./quickstart) for the shortest path to a working mint
2. [Installation](./installation) for package and runtime expectations
3. [SDK Client](./sdk/client) for the concrete API surface
4. [Architecture Overview](./architecture/overview) for PDAs and instruction flow

## Current Implementation Notes

- Reserve attestations are persisted as PDAs. The current program does not emit a dedicated reserve-attestation event.
- `AuditLogEntry` and `AuditLogRecorded` are defined in source, but the current program does not write audit PDAs or emit the audit event.
- Transfer-hook enforcement is a separate one-time setup step for hook-enabled mints.
