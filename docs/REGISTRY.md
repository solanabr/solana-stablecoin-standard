# Registry

## Purpose

The registry surface lets issuers publish a verifiable identity for a deployed stablecoin:

- preset class (`sss-1`, `sss-2`, `sss-3`)
- standard version
- deterministic config hash
- immutable feature flags and issuer metadata

The registry exists to solve a trust problem that most token standards leave open. Without a shared registry, wallets and DeFi protocols have no canonical way to determine whether a mint actually follows a claimed stablecoin standard.

## Current State

This repository currently ships:

- SDK helpers to compute a stable config hash
- a `getRegistryEntry()` helper on `SolanaStablecoin`
- backend API endpoints for storing and querying registry entries
- a CLI `registry` command for emitting the entry payload
- config-file support for issuer metadata such as `homepage` and `jurisdiction`
- an Anchor `sss-registry` program for release records and stablecoin registrations

The registry now has two layers:

- SDK/backend registry payloads for local/off-chain workflows
- on-chain `sss-registry` accounts for discovery, release auditing, and deprecation signaling

## Why It Matters

For issuers:

- registrations create a portable standards identity that can be referenced outside the issuer's own infrastructure
- release records make upgrades and deprecations legible

For integrators:

- the registry answers whether a mint is SSS-aligned before listing or routing liquidity to it
- config hashes and preset labels make integrations more auditable

For the standard itself:

- the registry is what turns SSS into something the wider ecosystem can verify, not just something issuers claim in docs
