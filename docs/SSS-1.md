# SSS-1: Minimal Stablecoin

## Abstract

SSS-1 defines the minimum stablecoin control surface for Solana issuance: mint authority, freeze authority, metadata, pause support, and role-based operational delegation.

## Specification

- Base mint metadata and authorities
- Mint, burn, freeze, thaw, pause, unpause
- Role assignment for minters, burners, and pausers

## Compliance Model

Compliance is reactive. Operators can freeze accounts when required, but transfers are not proactively screened on-chain.
