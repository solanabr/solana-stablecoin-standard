# Registry Program

## Purpose

The `sss-registry` program serves two roles:

- stablecoin discovery registry
- SSS release/version registry

## Accounts

- `RegistryConfig`: global registry authority
- `ReleaseRecord`: published SSS release metadata keyed by `standardVersion`
- `StablecoinRegistration`: registered deployment metadata keyed by mint

## Flows

1. Registry authority initializes the program config.
2. Registry authority publishes a release record for `sss/1.0.0`, `sss/1.1.0`, and so on.
3. Issuer registers a deployed stablecoin with its config hash, preset, and feature flags. The registry program validates the referenced stablecoin config PDA, authority, mint, and immutable feature flags before it accepts the record.
4. Wallets or DeFi protocols compare the deployment registration against release records to detect deprecated versions.

## Strategic Use

This gives the ecosystem a canonical answer to:

- is this token an SSS deployment?
- which preset and version is it using?
- is that version deprecated?

That matters operationally because it gives wallets, custodians, and DeFi protocols a machine-readable integration gate. Instead of hand-maintained allowlists and issuer PDFs, they can validate the mint against an on-chain registry record, the referenced stablecoin config PDA, and a published SSS release line.
