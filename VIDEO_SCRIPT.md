# SSS Bounty Video Script - 2:50

## [0:00-0:12] HOOK

"I built the Solana Stablecoin Standard - a modular SDK with three presets. SSS-1 for minimal tokens, SSS-2 for regulated compliance with real transfer-hook enforcement and token seizure, and SSS-3 - a private stablecoin powered by Cloak, my own privacy protocol for Solana."

SCREEN: Title card.

## [0:12-0:35] ARCHITECTURE

"Three layers - like OpenZeppelin. Layer 1 is the base: Token-2022 mint creation with metadata, role management with per-minter quotas, no single god key. Layer 2 is modules: a compliance module with transfer hooks and blacklist PDAs, and a privacy module powered by Cloak's shielded UTXO pool. Layer 3 is presets - SSS-1, SSS-2, SSS-3."

SCREEN: Architecture diagram from `docs/ARCHITECTURE.md`.

## [0:35-1:05] ON-CHAIN PROGRAM

"Thirteen instructions in a single configurable Anchor program. The key innovation: Token-2022 extensions are initialized via raw CPI before `InitializeMint2` - permanent delegate for seizure, transfer hook for blacklist enforcement. SSS-2 instructions fail gracefully with `ComplianceNotEnabled` if you initialized as SSS-1."

SCREEN: Quick scroll through `sss-stablecoin/src/instructions` and `sss-stablecoin/src/lib.rs`.

## [1:05-1:25] SSS-1 DEMO

"SSS-1 in action - initialize, mint, freeze, thaw, pause, unpause. All with real transaction signatures on Surfpool."

SCREEN: Terminal showing SSS-1 output from `./scripts/demo-all.sh`.

## [1:25-2:00] SSS-2 DEMO - COMPLIANCE FLOW

"Now SSS-2 - the regulated preset. Initialize with permanent delegate and transfer hook. Mint tokens. Transfer succeeds to a clean address. Then blacklist the recipient for OFAC match. Try transfer again - blocked by the transfer hook. The hook fires on every Token-2022 transfer and checks blacklist PDAs. Freeze the account. Seize via permanent delegate - tokens are moved to treasury. Recipient balance: zero."

SCREEN: Highlight `Transfer blocked as expected`, seize TX, and `Recipient ATA: 0`.

## [2:00-2:35] SSS-3 - CLOAK INTEGRATION

"SSS-3 is what no other submission has. It is powered by Cloak - a privacy protocol I built for Solana. Both systems run on the same Surfpool network. The SSS-3 stablecoin connects to a live Cloak relay returning real Merkle roots. The privacy module maps each SDK method to relay endpoints: shield deposit, private transfer, unshield withdraw. Compliance happens through a viewing-key hierarchy - issuer, compliance officer, auditor - and sanctions screening at the shield/unshield boundary. Privacy by default, transparency by authorization."

SCREEN: Terminal showing relay health, Merkle root, and SSS-3 output.

## [2:35-2:50] CLOSING

"Forty-one passing Rust tests, complete docs, TypeScript SDK, admin CLI, and backend services. Full PR is open. I am Marcelo, founder of Cloak Protocol and student at Inteli. Excited to keep building this with Superteam Brazil."

SCREEN: `cargo test` summary, docs listing, and end card with `@SuperteamBR` and `@kauenet`.
