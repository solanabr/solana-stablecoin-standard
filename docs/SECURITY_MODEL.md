# SSS Security Model

## 1. System Trust Boundaries

The Solana Stablecoin Standard (SSS) defines clear boundaries between on-chain enforcement and off-chain orchestration.

| Layer | Responsibility | Trust Assumption |
| :--- | :--- | :--- |
| **Monetary Core** | Enforces supply conservation and RBAC. | Zero Trust (Cryptographic Verification) |
| **Policy Plane** | Enforces compliance (Freeze/Blacklist). | Trusted Roles (Compliance Admins) |
| **Execution SDK** | Facilitates payload construction. | User-side Security |
| **Backend Services** | Orchestrates fiat-to-token bridges. | Semi-Trusted (Risk Management Layer) |

## 2. Authority Model & Role Separation

SSS utilizes a custom Role-Based Access Control (RBAC) system separate from simple account ownership.

### Master Authority
The ultimate root of trust. 
- Can reassign all other roles.
- Can rotate itself via `transfer_authority`.
- **Constraint**: Must be a highly secure multisig (e.g., Squads) or Cold Vault.

### Minter Role
- Granted the right to inflate supply within a specific `MinterQuota`.
- **Invariant**: Cannot mint beyond the assigned quota without a new `update_quota` transaction from the Master Authority.

### Compliance Roles (Blacklister / Pauser / Seizer)
- **Blacklister**: Manages the `BlacklistRegistry` PDA.
- **Pauser**: Can trigger global `is_paused` flag to halt all minting/burning.
- **Seizer**: Can move funds from a blacklisted account to a treasury.
    - **Guardian Condition**: `seize` requires the target to be present in the `BlacklistRegistry`.

## 3. On-Chain vs Off-Chain Responsibilities

### On-Chain (Program)
- **Validation**: PDAs, signatures, and monetary invariants.
- **Interception**: Transfer Hooks intercepting blacklisted transfers during the `Execute` instruction of Token-2022.

### Off-Chain (Orchestrator)
- **KYC/AML**: Validation of user identity before calling the `mint` endpoint.
- **Persistence**: Indexing transactions to maintain an audit trail for institutional reporting.
- **Security**: All orchestration endpoints are guarded by `X-API-KEY` authentication.

## 4. Invariant Protections

1. **Supply Conservation**: `TotalSupply` on-chain must be verifiable against the sum of SPL-Token accounts.
2. **Quota Integrity**: Minter power is finite and metered.
3. **Role Isolation**: Compromising a `Seizer` key does not allow `Minting` or `Pausing`.

## 5. Security Rationale

### Permanent Delegate
SSS-2 utilize the `PermanentDelegate` extension of Token-2022. The program PDA (`config`) is set as the delegate. This allows the protocol to:
- Recover lost funds.
- Execute court-ordered seizures.
- Ensure funds never move from blacklisted accounts (via hook enforcement).

### Transfer Hooks
Unlike legacy SPL tokens, SSS-2 tokens are "programmable". Every transfer triggers a CPI to the `transfer_hook` program, which verifies the `BlacklistRegistry` state before allowing completion, preventing "wash-transfers" before a manual freeze can be applied.

## 6. Upgrade Authority
The program upgrade authority must be locked behind a multi-signature wallet with a time-delay (Timelock) for institutional release.
