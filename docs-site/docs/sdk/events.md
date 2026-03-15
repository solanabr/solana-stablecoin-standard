---
title: Events
description: On-chain event types and log parsing helpers exported by the SSS SDK.
---

# Events

The SDK exposes strongly named event interfaces plus two parsing helpers:

```ts
createEventParser(program: Program): EventParser
parseTransactionEvents(program: Program, logs: string[]): SSSEvent[]
```

## Event Union

```ts
type SSSEvent =
  | StablecoinInitializedEvent
  | TokensMintedEvent
  | TokensBurnedEvent
  | AccountFrozenEvent
  | AccountThawedEvent
  | ProgramPausedEvent
  | ProgramUnpausedEvent
  | RoleUpdatedEvent
  | MinterUpdatedEvent
  | AuthorityTransferredEvent
  | BlacklistAddedEvent
  | BlacklistRemovedEvent
  | TokensSeizedEvent
  | AuditLogRecordedEvent;
```

## Event Names

| Event name | Key fields |
| --- | --- |
| `stablecoinInitialized` | `mint`, `masterAuthority`, `name`, `symbol`, `preset` |
| `tokensMinted` | `minter`, `recipient`, `amount`, `totalMinted` |
| `tokensBurned` | `burner`, `from`, `amount`, `totalBurned` |
| `accountFrozen` | `authority`, `targetAccount` |
| `accountThawed` | `authority`, `targetAccount` |
| `programPaused` | `pauser` |
| `programUnpaused` | `pauser` |
| `roleUpdated` | `role`, `oldHolder`, `newHolder`, `updatedBy` |
| `minterUpdated` | `minter`, `isActive`, `mintQuota`, `updatedBy` |
| `authorityTransferred` | `oldAuthority`, `newAuthority` |
| `blacklistAdded` | `blockedAddress`, `reason`, `blacklistedBy` |
| `blacklistRemoved` | `unblockedAddress`, `removedBy` |
| `tokensSeized` | `from`, `amount`, `seizedBy` |
| `auditLogRecorded` | `index`, `action`, `actor` |

All payloads include `config: PublicKey` and `timestamp: BN`.

## Parsing Example

```ts
const tx = await connection.getTransaction(signature, {
  commitment: "confirmed",
});

const events = parseTransactionEvents(
  client.tokenProgram,
  tx?.meta?.logMessages ?? []
);
```

## Current Program Behavior

The SDK defines `AuditLogRecordedEvent`, but the current on-chain program does not emit it.

The current `attest_reserve` instruction persists a PDA but does not emit a dedicated reserve-attestation event. If you want reserve history, fetch attestation accounts by index.
