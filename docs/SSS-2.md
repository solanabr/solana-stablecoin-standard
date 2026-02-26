# SSS-2: Compliant Preset

SSS-2 extends SSS-1 with transfer-level compliance enforcement. Every transfer passes through a transfer hook that checks sender and receiver blacklists. New token accounts start frozen, enabling KYC gating before holders can transact.

## Token-2022 Extensions

| Extension | Configuration | Purpose |
|---|---|---|
| MetadataPointer | Authority: config PDA, Address: mint | On-chain token metadata |
| PermanentDelegate | Delegate: config PDA | Enables burn-from-any and seize |
| TransferHook | Authority: config PDA, Program: sss-transfer-hook | Routes transfers through blacklist enforcement |
| DefaultAccountState | State: Frozen | New token accounts start frozen |

## How the Transfer Hook Works

### Initialization

During stablecoin creation, the SDK calls `initialize_extra_account_metas` on the transfer hook program. This creates an `ExtraAccountMetaList` PDA that tells Token-2022 which additional accounts to resolve during transfers.

The extra accounts are:

1. **Sender blacklist PDA** -- Seeds: `["blacklist", mint, source_authority]`
2. **Receiver blacklist PDA** -- Seeds: `["blacklist", mint, destination_owner]`

The destination owner is extracted from the destination token account data at offset 32 (the `owner` field in the token account layout).

### Transfer Execution

```
User calls transfer_checked
        |
        v
Token-2022 validates basic transfer rules
        |
        v
Token-2022 resolves ExtraAccountMetaList
  - Derives sender blacklist PDA
  - Derives receiver blacklist PDA
        |
        v
Token-2022 invokes sss-transfer-hook::transfer_hook
        |
        v
Hook checks sender_blacklist PDA:
  - If PDA exists (data, owned by hook program) -> REJECT (SenderBlacklisted)
  - If PDA empty -> OK
        |
        v
Hook checks receiver_blacklist PDA:
  - If PDA exists -> REJECT (ReceiverBlacklisted)
  - If PDA empty -> OK
        |
        v
Transfer proceeds
```

### Fallback Handler

Token-2022 invokes the transfer hook using the SPL transfer hook interface discriminator, not Anchor's 8-byte discriminator. The `fallback` function in the hook program intercepts these calls and routes them to the Anchor-generated `transfer_hook` handler.

## Blacklist Management

### Adding to Blacklist

Admin-only. Creates a `BlacklistEntry` PDA at `["blacklist", mint, address]`.

```typescript
await sss.blacklist.add(walletAddress, "OFAC compliance");
```

The hook program verifies admin authorization through cross-program PDA verification:
1. Re-derives the sss-core config PDA from the mint
2. Re-derives the expected admin role PDA
3. Verifies the provided `admin_role` account matches and is owned by sss-core

### Removing from Blacklist

Admin-only. Closes the `BlacklistEntry` PDA, returning rent to the admin.

```typescript
await sss.blacklist.remove(walletAddress);
```

### Checking Blacklist Status

```typescript
const isBlacklisted = await sss.blacklist.check(walletAddress);
```

### BlacklistEntry Data

```
BlacklistEntry {
  mint: Pubkey,       // The stablecoin this entry applies to
  address: Pubkey,    // The blacklisted wallet
  added_by: Pubkey,   // Admin who created the entry
  added_at: i64,      // Unix timestamp
  reason: String,     // Compliance reason (max 128 chars)
  bump: u8,           // PDA bump
}
```

## KYC Gating with DefaultAccountState

SSS-2 mints use `DefaultAccountState::Frozen`, meaning every new Associated Token Account starts in a frozen state. This creates a natural KYC gate:

1. User creates a token account (automatically frozen)
2. User completes off-chain KYC verification
3. Operator with `freezer` role thaws the account
4. User can now send and receive tokens

Any account that has been thawed can be re-frozen if compliance status changes.

## Capabilities

All SSS-1 capabilities plus:

| Operation | Required Role | Description |
|---|---|---|
| Add to blacklist | Admin | Block address from all transfers |
| Remove from blacklist | Admin | Unblock address |
| Check blacklist | Any | Query blacklist status |
| Transfer hook enforcement | Automatic | Every transfer checked |
| KYC gating | Freezer | Thaw accounts after verification |

## Use Cases

- **Regulated stablecoins** -- Stablecoins subject to AML/KYC requirements
- **CBDC-like tokens** -- Central bank digital currency prototypes with compliance built in
- **Institutional tokens** -- Tokens for institutional investors requiring transfer restrictions
- **Sanctioned entity enforcement** -- Automatic blocking of OFAC-listed or flagged addresses

## Mint Creation Flow

The SSS-2 creation transaction includes everything from SSS-1 plus:

1. `initializeTransferHook` -- Set config PDA as hook authority, point to sss-transfer-hook program
2. `initializeDefaultAccountState` -- Set default state to Frozen
3. `sss-transfer-hook::initialize_extra_account_metas` -- Register blacklist PDA derivation rules

## Example

```typescript
import { SSS } from "@stbr/sss-token";

// Create SSS-2 stablecoin
const sss = await SSS.create(provider, {
  preset: "sss-2",
  name: "Regulated USD",
  symbol: "rUSD",
  decimals: 6,
});

// Set up compliance roles
await sss.roles.grant(complianceWallet, "freezer");
await sss.roles.grant(minterWallet, "minter");

// KYC flow: thaw an account after verification
await sss.thaw(userTokenAccount);

// Mint tokens to verified user
await sss.mintTokens(userTokenAccount, 1_000_000n);

// Blacklist a sanctioned address
await sss.blacklist.add(sanctionedWallet, "OFAC SDN list");

// Transfers to/from sanctioned address will now fail automatically
// via the transfer hook

// Remove from blacklist after review
await sss.blacklist.remove(sanctionedWallet);
```

## Transfer Hook Account Layout

When Token-2022 invokes the transfer hook, the accounts are ordered as:

| Index | Account | Description |
|---|---|---|
| 0 | Source token account | Validated by Token-2022 |
| 1 | Mint | Validated by Token-2022 |
| 2 | Destination token account | Validated by Token-2022 |
| 3 | Source authority | Owner or delegate |
| 4 | ExtraAccountMetaList PDA | Validation state |
| 5 | Sender blacklist PDA | Resolved from seeds |
| 6 | Receiver blacklist PDA | Resolved from seeds |

## Limitations

- **No privacy** -- All balances and transfer amounts are visible on-chain
- **Hook latency** -- Every transfer requires additional PDA resolution and program invocation
- **Transfer hooks are incompatible with confidential transfers** -- Cannot combine SSS-2 and SSS-3 features on the same mint
