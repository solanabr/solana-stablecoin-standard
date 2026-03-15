---
title: Errors
description: Error tables and handling patterns for SSS token-program and transfer-hook failures.
---

# Errors

The SDK exports:

```ts
interface SSSErrorInfo {
  code: number;
  name: string;
  msg: string;
}

class SSSError extends Error {
  code: number;
  errorName: string;
  static fromCode(code: number): SSSError | null;
  static fromAnchorError(err: any): SSSError | null;
}
```

## Token Program Errors

| Code | Name |
| --- | --- |
| `6000` | `Unauthorized` |
| `6001` | `InvalidAuthority` |
| `6002` | `ProgramPaused` |
| `6003` | `ProgramNotPaused` |
| `6004` | `MinterNotActive` |
| `6005` | `MintQuotaExceeded` |
| `6006` | `MintAmountZero` |
| `6007` | `BurnAmountZero` |
| `6008` | `InsufficientBalance` |
| `6009` | `FeatureNotEnabled` |
| `6010` | `BlacklistNotEnabled` |
| `6011` | `TransferHookNotEnabled` |
| `6012` | `ConfidentialTransfersNotEnabled` |
| `6013` | `AlreadyBlacklisted` |
| `6014` | `NotBlacklisted` |
| `6015` | `CannotBlacklistAuthority` |
| `6016` | `NameTooLong` |
| `6017` | `SymbolTooLong` |
| `6018` | `UriTooLong` |
| `6019` | `ReasonTooLong` |
| `6020` | `DetailsTooLong` |
| `6021` | `InvalidDecimals` |
| `6022` | `SameAuthority` |
| `6023` | `ZeroAuthority` |
| `6024` | `SeizeAmountZero` |
| `6025` | `SeizeSameAccount` |
| `6026` | `Overflow` |

## Transfer-Hook Errors

| Code | Name |
| --- | --- |
| `6000` | `SourceBlacklisted` |
| `6001` | `DestinationBlacklisted` |
| `6002` | `Unauthorized` |
| `6003` | `InvalidConfig` |

## Handling Pattern

```ts
import {SSSError} from "solana-stablecoin-standard";

try {
  await client.mintTokens(mint, amount, recipientAta);
} catch (err) {
  const sssErr = SSSError.fromAnchorError(err);
  if (sssErr) {
    console.error(sssErr.code, sssErr.errorName, sssErr.message);
  } else {
    console.error(err);
  }
}
```

## What `fromAnchorError` Parses

- `err.error.errorCode.number`
- numeric codes found in transaction logs
- `custom program error: 0x...` messages

## Important Limitation

`SSSError.fromCode(...)` currently indexes only token-program errors. Transfer-hook errors reuse the same numeric range, so automatic hook decoding is ambiguous:

- hook `6000` means `SourceBlacklisted`
- token `6000` means `Unauthorized`

If you need precise hook error handling, inspect logs and program context instead of trusting `fromCode(6000)`.
