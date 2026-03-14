# SSS-1 Specification (Minimal)

## Goal
Provide a minimal stablecoin issuance baseline using Token-2022 + governed authorities.

## Required Components
- `sss_core` Config PDA
- Mint with Token-2022 base setup
- Role-gated mint and burn instructions

## Instruction Set
- `initialize`
- `mint_token`
- `burn_token`

## Security Model
- Minting restricted to `minter_authority`.
- Burning restricted to `burner_authority`.
- Oracle adjustment optional and bounded by checked arithmetic.
