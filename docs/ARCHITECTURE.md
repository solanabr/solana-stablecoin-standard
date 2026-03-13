# SSS System Architecture

## 1. Layered Architecture

The Solana Stablecoin Standard is designed with a strict separation of concerns across 3 primary layers.

| Layer | Component | Function |
| :--- | :--- | :--- |
| **Layer 1: Base SDK** | `@stbr/sss-token` | Core logic, transaction building, and PDA derivation. |
| **Layer 2: Standard Modules** | `programs/sss` / `programs/transfer_hook` | On-chain enforcement, monetary invariants, RBAC. |
| **Layer 3: Operations & Presets** | `cli`, `services`, `apps/frontend` | High-level orchestration, monitoring, and compliance workflows. |

## 2. High-Level Interaction Diagram

```mermaid
graph TD
    A[Institution / Master Authority] -->|Update Roles/Quotas| B(SSS Core Program)
    C[Minter] -->|mint_token| B
    D[Token Holder] -->|transfer| E{Token-2022 Extension}
    E -->|CPI| F(Transfer Hook Program)
    F -->|Check| G[(BlacklistRegistry PDA)]
    H[Orchestrator Backend] -->|Polls Events| I[(PostgreSQL Index)]
    B -->|Emits Events| H
```

## 3. Core Component Interaction

### On-Chain Programs
- **SSS Core**: The central registry. Holds configuration and roles.
- **Transfer Hook**: The compliance interceptor. It is invoked on every transfer to verify sanctions status.

### TypeScript SDK (`sdk/`)
Abstraction layer that prevents developers from manually deriving PDA seeds.
- `SolanaStablecoin.load()`: Hydrates a stablecoin object with RPC and Program handlers.
- `SolanaStablecoin.mint()`: Builds the complex transaction involving compute unit limits and multi-registry accounts.

### Backend Infrastructure (`services/`)
- **Indexer**: Uses Anchor `EventParser` to stream real-time data into PostgreSQL.
- **Orchestrator**: Acts as the bridge for Fiat-to-SSS flows, ensuring KYC/AML before triggering the SDK.

## 4. Mint/Burn Lifecycle Flow

```mermaid
sequenceDiagram
    participant U as User
    participant B as Backend (Orchestrator)
    participant S as SDK
    participant P as SSS Program
    participant T as Token-2022

    U->>B: Fiat Deposit Completed
    B->>B: Verify KYC
    B->>S: Request Mint (X-API-KEY)
    S->>P: Call mint_token (with Quota PDA)
    P->>P: Check Quota & Role
    P->>T: CPI: MintTo
    T->>P: Success
    P->>B: Emit MintEvent
    B->>U: Token Balance Refined
```

## 5. Compliance Transfer Flow

```mermaid
sequenceDiagram
    participant S as Sender
    participant T as Token-2022
    participant H as Transfer Hook
    participant B as Blacklist PDA
    participant R as Receiver

    S->>T: Request Transfer
    T->>H: CPI: Execute
    H->>B: Check Sender & Receiver
    Note right of B: If found, abort.
    B->>H: Response: OK
    H->>T: Return Result
    T->>R: Finalize Balances
```
