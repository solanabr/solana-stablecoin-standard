# SSS-2: Compliant Stablecoin

## Abstract

SSS-2 extends SSS-1 with proactive transfer screening and seizure-oriented controls suitable for regulated stablecoin deployments.

## Specification

- All SSS-1 capabilities
- Permanent delegate enabled at mint creation
- Transfer hook enabled for blacklist checks
- Blacklist add/remove flows
- Seize flow for sanctioned balances

## Compliance Model

Transfers are intended to be checked on every move using the transfer-hook module. Blacklisted accounts can be frozen and their balances redirected under authorized operational procedures.

## Why SSS-2 Is More Than A Flag Set

SSS-2 is the repo's institutional preset. Its value is not just that it enables more Token-2022 extensions, but that it combines them into an enforceable operating model:

- transfer-hook checks convert blacklist state into transfer-time enforcement
- permanent delegate support makes seizure-oriented recovery flows possible
- role separation reduces the chance that one operator key becomes the entire risk boundary

That makes SSS-2 suitable for stablecoins that need to explain their compliance controls to partners, auditors, and regulators in concrete technical terms.
