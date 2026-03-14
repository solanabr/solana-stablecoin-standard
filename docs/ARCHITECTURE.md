# ARCHITECTURE

## SSS-2 Data Flow (Mermaid)

```mermaid
flowchart LR
  A[Admin / SDK] --> B[sss_core::initialize]
  B --> C[Config PDA]
  A --> D[Token-2022 Mint pre-allocation]
  D --> E[Mint initialized with extensions]
  A --> F[transfer_hook::initialize_extra_account_meta_list]
  F --> G[ExtraAccountMetaList PDA]

  A --> H[Mint Token]
  H --> I[sss_core::mint_token]
  I --> J[Token-2022 mint_to CPI]

  A --> K[Blacklist wallet]
  K --> L[transfer_hook::add_to_blacklist]
  L --> M[Blacklist PDA]

  N[User transfer] --> O[Token-2022 transfer_checked]
  O --> P[Hook execute interface]
  P --> Q{Blacklist PDA exists?}
  Q -->|Yes| R[Reject transfer]
  Q -->|No| S[Allow transfer]

  A --> T[Seize]
  T --> U[sss_core::seize_tokens]
  U --> V[Token-2022 transfer_checked invoke_signed]
```

## PDA Layout (ASCII)

```text
[sss_core]
  config PDA = PDA("config", sss_core_program_id)
  mock_oracle PDA = PDA("mock_oracle", sss_core_program_id)

[transfer_hook]
  blacklist PDA = PDA("blacklist", wallet_pubkey, transfer_hook_program_id)
  extra_meta PDA = PDA("extra-account-metas", mint_pubkey, transfer_hook_program_id)
```

## Design Notes
- No CPI-time reallocation is used. Accounts for mint/extensions are pre-allocated client-side.
- Transfer Hook account list is deterministic through `ExtraAccountMetaList`.
