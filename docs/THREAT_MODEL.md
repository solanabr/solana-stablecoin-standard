# SSS Threat Model

## 1. Adversary Definitions

| Adversary | Motivation | Capability |
| :--- | :--- | :--- |
| **External Attacker** | Theft of funds / Chain disruption. | Exploiting program logic / Front-running. |
| **Malicious Operator** | Insider theft / Quota abuse. | Access to Seizer or Minter keys. |
| **Compromised Backend** | Supply inflation. | Access to Orchestrator API Keys. |
| **MEV / Searcher** | Slippage exploitation / Front-running. | Transaction reordering on Solana. |

## 2. Attack Surfaces & Vector Analysis

### Surface: Mint Authority Bypass [Critical]
- **Threat**: Forging a `MinterQuota` PDA or bypassing the `UpdateQuota` authorization.
- **Mitigation**: Strict PDA seed verification (`seeds = [b"quota", config.key().as_ref(), minter.as_ref()]`) and Anchor's `has_one` Master Authority check.

### Surface: Unlimited Seizure [Critical] - PATCHED (V4)
- **Threat**: A `Seizer` role draining non-blacklisted accounts.
- **Mitigation**: On-chain constraint requiring a valid `BlacklistRegistry` account for the `from` address in the `seize` instruction.

### Surface: Initializer Front-run [High] - PATCHED (V4)
- **Threat**: Attacker calls `initialize` on a new Mint before the institution.
- **Mitigation**: Requirement that the `payer` of `initialize` must also be the current `mint_authority` of the Token-2022 Mint.

### Surface: Transfer Hook Evasion [High]
- **Threat**: Moving funds without triggering the Hook.
- **Mitigation**: Native Token-2022 enforcement. The `TransferHook` extension is immutable once configured without Master Authority.

### Surface: API Injection [High] - PATCHED (V4)
- **Threat**: Unauthenticated POST requests to `/api/orchestrate/mint`.
- **Mitigation**: `X-API-KEY` middleware and IP allowlisting on backend services.

## 3. Attack Scenarios & Mitigations

### Scenario: The Rogue Minter
- **Attack**: A minter key is compromised and attempts to mint $1B.
- **Mitigation**: The `MinterQuota` acts as a circuit breaker. The attacker can only mint up to the pre-authorized limit.

### Scenario: The Sanctions Bypass
- **Attack**: A blacklisted user attempts to transfer tokens to a clean sub-wallet.
- **Mitigation**: The `transfer_hook` program performs an on-chain lookup of the `from` address against the `BlacklistRegistry` PDA. If found, the transaction is aborted by the Solana Runtime.

### Scenario: State Desynchronization
- **Attack**: An operator believes a Mint failed and retries, causing double issuance.
- **Mitigation**: The `orchestrator` uses `PostgreSQL` with `tx_signature` unique constraints to ensure idempotency.
