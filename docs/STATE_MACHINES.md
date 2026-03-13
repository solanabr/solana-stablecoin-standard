# SSS State Machine Specification

## 1. Protocol Global States

The system state is governed by the `StablecoinConfig` account.

| State | transitions | Description |
| :--- | :--- | :--- |
| **ACTIVE** | `pause` -> **PAUSED** | All instructions (Mint, Burn, Transfer) operate normally. |
| **PAUSED** | `pause` -> **ACTIVE** | Mint/Burn instructions are blocked via `StablecoinError::SystemPaused`. |

## 2. Account-Level States

Individual Token Accounts transition through states managed by the Compliance roles.

| Account State | Instruction | Resulting State |
| :--- | :--- | :--- |
| **NORMAL** | `freeze_account` | **FROZEN** |
| **FROZEN** | `thaw_account` | **NORMAL** |
| **NORMAL** | `add_to_blacklist` | **BLACKLISTED** |
| **BLACKLISTED** | `remove_from_blacklist`| **NORMAL** |

## 3. State Transition Matrix

### Protocol Transitions
- **`initialize`**: `None` -> `ACTIVE`
    - Creates the `StablecoinConfig` account.
    - Sets immutable policy flags (`enable_permanent_delegate`, etc.).
- **`pause(true)`**: `ACTIVE` -> `PAUSED`
    - High-integrity stop of all monetary movements.

### Compliance Transitions
- **`add_to_blacklist`**:
    - Creates a `BlacklistRegistry` PDA.
    - **Effect**: Any `transfer` involving this account will fail in the `transfer_hook`.
- **`seize`**:
    - Transfers funds from `BLACKLISTED` account to a designated treasury.
    - **Pre-requisite**: Target must be in `BLACKLISTED` state.

## 4. Forbidden Transitions
- **`mint`** while `is_paused = true`.
- **`burn`** while `is_paused = true`.
- **`seize`** from a `NORMAL` account (Enforced by V4 patch).
- **`thaw_account`** if the account is `BLACKLISTED` (Policy level best practice).

## 5. State Invariant Preservation
- Every state transition must emit an **Anchor Event** to ensure the Execution Plane (Indexer) reflects the On-chain reality.
- Role transitions (`update_roles`) are atomic and immediate.
