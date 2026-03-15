# SSS Token Program

Core Solana Stablecoin Standard program implementing 20 instructions for regulated stablecoin issuance on Solana.

**Program ID:** `5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4`

## Features

- **Token-2022 Extensions** -- Built on SPL Token-2022 with transfer hooks, metadata, and permanent delegate
- **Compliance Presets** -- SSS-1, SSS-2, SSS-3, and Custom presets for varying regulatory requirements
- **Role-Based Access Control** -- Separate authorities for minting, freezing, blacklisting, and configuration
- **Blacklist Enforcement** -- Integrated with the SSS Transfer Hook program to reject transfers involving blacklisted addresses
- **Reserve Attestations** -- On-chain reserve proof publishing with configurable staleness thresholds
- **Supply Cap Management** -- Hard supply cap enforcement at the protocol level

## Links

| Resource | URL |
|----------|-----|
| Crate | [crates.io/crates/sss-token](https://crates.io/crates/sss-token) |
| TypeScript SDK | [npmjs.com/package/solana-stablecoin-standard](https://www.npmjs.com/package/solana-stablecoin-standard) |
| Documentation | [docs.stablecoinstandard.dev](https://docs.stablecoinstandard.dev) |
| Repository | [github.com/solanabr/solana-stablecoin-standard](https://github.com/solanabr/solana-stablecoin-standard) |

## License

Apache-2.0
