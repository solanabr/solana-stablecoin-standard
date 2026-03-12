# SSS Transfer Hook Program

SPL Transfer Hook implementation that enforces blacklist restrictions on every Token-2022 transfer within the Solana Stablecoin Standard.

**Program ID:** `FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy`

## How It Works

- **Transfer Hook Interface** -- Integrates with the Token-2022 transfer hook interface so every transfer is validated automatically
- **Blacklist PDA Derivation** -- Derives sender and recipient blacklist PDAs from the stablecoin config to check status on-chain
- **Transfer Rejection** -- Rejects any transfer where either the sender or recipient is blacklisted
- **Seize Operations** -- Allows seize (forced transfer) operations when the authority is the config PDA, enabling compliance actions on blacklisted accounts

## Links

| Resource | URL |
|----------|-----|
| Crate | [crates.io/crates/sss-transfer-hook](https://crates.io/crates/sss-transfer-hook) |
| TypeScript SDK | [npmjs.com/package/solana-stablecoin-standard](https://www.npmjs.com/package/solana-stablecoin-standard) |
| Documentation | [docs.stablecoinstandard.dev](https://docs.stablecoinstandard.dev) |
| Repository | [github.com/solanabr/solana-stablecoin-standard](https://github.com/solanabr/solana-stablecoin-standard) |

## License

Apache-2.0
