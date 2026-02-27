# Presets

SSS defines three built-in preset tiers and a custom mode. Presets determine which Token-2022 extensions are activated at mint initialization and which program features are available at runtime. Once a stablecoin is initialized with a preset, the feature flags are immutable.

## Feature Matrix

| Feature | SSS-1 (Minimal) | SSS-2 (Compliant) | SSS-3 (Private) | Custom |
|---------|:---:|:---:|:---:|:---:|
| MetadataPointer extension | Yes | Yes | Yes | Configurable |
| Mint / Burn | Yes | Yes | Yes | Yes |
| Freeze / Thaw | Yes | Yes | Yes | Yes |
| Pause / Unpause | Yes | Yes | Yes | Yes |
| Role management | Yes | Yes | Yes | Yes |
| Minter quotas | Yes | Yes | Yes | Yes |
| Reserve attestation | Yes | Yes | Yes | Yes |
| Audit log | Yes | Yes | Yes | Yes |
| PermanentDelegate extension | No | Yes | Yes | Configurable |
| TransferHook extension | No | Yes | No | Configurable |
| DefaultAccountState extension | No | Configurable | No | Configurable |
| ConfidentialTransferMint extension | No | No | Yes | Configurable |
| Blacklist (add/remove) | No | Yes | No | Requires PermanentDelegate + TransferHook |
| Seize tokens | No | Yes | No | Requires PermanentDelegate + TransferHook |
| Transfer restrictions | No | Yes (hook-based) | No | Requires TransferHook |
| Confidential transfers | No | No | Yes | Requires ConfidentialTransferMint |

## Preset Configurations

### SSS-1 -- Minimal

```
enable_permanent_delegate:       false
enable_transfer_hook:            false
default_account_frozen:          false
enable_confidential_transfers:   false
```

The minimal preset creates a standard Token-2022 mint with metadata. The StablecoinConfig PDA serves as mint authority and freeze authority. All core operations (mint, burn, freeze, thaw, pause, unpause, role management, minter quotas, reserve attestation) are available.

No transfer restrictions are enforced. Any holder can freely transfer tokens. Blacklist and seize instructions will fail with `BlacklistNotEnabled`.

### SSS-2 -- Compliant

```
enable_permanent_delegate:       true
enable_transfer_hook:            true
default_account_frozen:          false
enable_confidential_transfers:   false
```

The compliant preset adds all enforcement capabilities on top of SSS-1. The permanent delegate extension allows the program to burn tokens from any account (used during seizure). The transfer hook extension registers the `sss-transfer-hook` program to validate every transfer against the blacklist.

After initialization, the `sss-transfer-hook::initialize_extra_account_meta_list` instruction must be called once to set up the ExtraAccountMetaList PDA. This is required before any transfers can succeed.

When an address is blacklisted:
1. A BlacklistEntry PDA is created
2. The target's token account is frozen
3. All subsequent `transfer_checked` calls involving this address are rejected by the transfer hook
4. The seizer role can seize tokens from the blacklisted account

### SSS-3 -- Private

```
enable_permanent_delegate:       true
enable_transfer_hook:            false
default_account_frozen:          false
enable_confidential_transfers:   true
```

The private preset enables confidential transfers using zero-knowledge proofs. Transfer amounts are encrypted on-chain while the permanent delegate retains the ability to perform compliance actions. The transfer hook is not used; compliance enforcement relies on the permanent delegate rather than per-transfer checks.

This preset is designed for use cases where transaction privacy is required but a regulatory authority must retain oversight capabilities (e.g., the ability to freeze accounts and seize funds if necessary).

Note: SSS-3 is defined at the program level but the confidential transfer integration is not yet fully implemented in the current codebase.

### Custom

```
enable_permanent_delegate:       user-defined
enable_transfer_hook:            user-defined
default_account_frozen:          user-defined
enable_confidential_transfers:   user-defined
```

The custom preset allows issuers to select any combination of feature flags. This is intended for advanced use cases that do not fit the three standard tiers. Feature gating at the instruction level still applies: for example, blacklist instructions require both `enable_permanent_delegate` and `enable_transfer_hook` to be true, regardless of the preset label.

## Choosing a Preset

### Use SSS-1 when:

- You are building an internal stablecoin or testnet token
- No regulatory compliance requirements exist
- You want the simplest possible deployment
- Transfer restrictions are not needed
- You plan to upgrade to SSS-2 later by deploying a new mint (in-place upgrade is not supported since feature flags are immutable)

### Use SSS-2 when:

- You are issuing a regulated stablecoin (e.g., for payments, remittances, DeFi)
- OFAC sanctions screening or similar compliance requirements apply
- You need the ability to blacklist addresses and seize illicit funds
- GENIUS Act reserve attestation transparency is required
- Your legal framework requires a "freeze and seize" capability

### Use SSS-3 when:

- Transaction privacy is a core requirement
- You need confidential transfer amounts while maintaining regulatory oversight
- Your compliance model relies on permanent delegate authority rather than per-transfer hook validation
- You are operating in a jurisdiction that permits privacy-preserving stablecoins with supervisory access

### Use Custom when:

- You need a specific combination not covered by the three standard presets
- You want permanent delegate without transfer hook (e.g., seizure capability but no per-transfer blacklist checks)
- You want default-frozen accounts with SSS-1 (requiring explicit thaw for each new holder)
- You are experimenting with novel compliance models

## Preset Selection in Code

### Rust (on-chain)

```rust
use sss_token::state::StablecoinPreset;

// In the InitializeParams:
let params = InitializeParams {
    name: "USD Coin".to_string(),
    symbol: "USDC".to_string(),
    uri: "https://example.com/metadata.json".to_string(),
    decimals: 6,
    preset: StablecoinPreset::SSS2,
};
```

### TypeScript (SDK)

```typescript
import { StablecoinPreset, getPresetAnchorEnum, PRESET_CONFIGS } from "@solana-stablecoin-standard/sdk";

// Get the Anchor enum variant
const preset = getPresetAnchorEnum(StablecoinPreset.SSS2);
// Result: { sss2: {} }

// Inspect the full preset configuration
const config = PRESET_CONFIGS[StablecoinPreset.SSS2];
// Result: {
//   preset: { sss2: {} },
//   enablePermanentDelegate: true,
//   enableTransferHook: true,
//   defaultAccountFrozen: false,
//   enableConfidentialTransfers: false,
// }
```

### CLI

```bash
sss init --preset sss-2 --name "USD Coin" --symbol USDC --decimals 6
```

Valid `--preset` values: `sss-1`, `sss-2`, `sss-3`, `custom`.
