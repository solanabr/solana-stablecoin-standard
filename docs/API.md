# Backend REST API Reference

The SSS backend is an Express.js server that wraps the TypeScript SDK's `SSSClient`. All endpoints are mounted under `/api/stablecoin`.

## Base URL

```
http://localhost:3001/api/stablecoin
```

## Authentication

The backend signs transactions using a server-side keypair configured at startup. The signing keypair must hold the appropriate role for each operation (e.g., minter role for `/mint`, blacklister role for `/blacklist/add`).

API-level authentication (API keys, JWT, IP allowlisting) should be configured at the reverse proxy or middleware layer before exposing the backend to external clients. The routes themselves do not enforce caller authentication -- they trust the backend's internal keypair.

## Error Handling

All errors follow this structure:

```json
{
  "error": {
    "code": 6005,
    "name": "MintQuotaExceeded",
    "message": "MintQuotaExceeded (6005): Mint amount exceeds minter quota"
  }
}
```

SSS-specific errors are wrapped from the on-chain program error codes. See the full error table at the end of this document.

---

## GET Endpoints

### GET /:mint

Fetch the stablecoin configuration and role registry for a mint.

**Parameters:**

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `mint` | URL path | `string` (base58 pubkey) | The stablecoin mint address |

**Response: 200 OK**

```json
{
  "config": {
    "bump": 255,
    "mint": "7Kp3...xyz",
    "masterAuthority": "9Ab2...def",
    "name": "USD Coin",
    "symbol": "USDC",
    "uri": "https://example.com/metadata.json",
    "decimals": 6,
    "preset": { "sss2": {} },
    "enablePermanentDelegate": true,
    "enableTransferHook": true,
    "defaultAccountFrozen": false,
    "enableConfidentialTransfers": false,
    "isPaused": false,
    "totalMinted": "1000000000000",
    "totalBurned": "50000000000",
    "auditLogIndex": "42",
    "reserveAttestationIndex": "3",
    "createdAt": "1709251200",
    "updatedAt": "1709337600"
  },
  "roles": {
    "bump": 254,
    "config": "Config111...PDA",
    "masterAuthority": "9Ab2...def",
    "pauser": "4Mn6...pqr",
    "blacklister": "5Hj1...abc",
    "seizer": "6Lp8...stu"
  }
}
```

---

### GET /:mint/minter/:address

Fetch minter info for a specific wallet address.

**Parameters:**

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `mint` | URL path | `string` (base58 pubkey) | The stablecoin mint address |
| `address` | URL path | `string` (base58 pubkey) | The minter's wallet address |

**Response: 200 OK**

```json
{
  "bump": 253,
  "config": "Config111...PDA",
  "minter": "6Lp8...stu",
  "isActive": true,
  "mintQuota": "10000000000000",
  "totalMinted": "2500000000000",
  "createdAt": "1709251200",
  "lastMintAt": "1709337600"
}
```

**Error: 404** if the MinterInfo PDA does not exist (minter was never configured).

---

### GET /:mint/blacklist/:address

Check whether an address is blacklisted.

**Parameters:**

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `mint` | URL path | `string` (base58 pubkey) | The stablecoin mint address |
| `address` | URL path | `string` (base58 pubkey) | The wallet address to check |

**Response: 200 OK (not blacklisted)**

```json
{
  "blacklisted": false,
  "entry": null
}
```

**Response: 200 OK (blacklisted)**

```json
{
  "blacklisted": true,
  "entry": {
    "bump": 252,
    "config": "Config111...PDA",
    "blockedAddress": "Bad1...actor",
    "reason": "OFAC SDN List - Entry 12345",
    "blacklistedBy": "5Hj1...abc",
    "blacklistedAt": "1709337600"
  }
}
```

---

### GET /:mint/attestation/:index

Fetch a reserve attestation by its sequential index.

**Parameters:**

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `mint` | URL path | `string` (base58 pubkey) | The stablecoin mint address |
| `index` | URL path | `string` (integer) | The attestation index (0-based) |

**Response: 200 OK**

```json
{
  "bump": 251,
  "config": "Config111...PDA",
  "index": "2",
  "reserveHash": [161, 178, 195, 212, ...],
  "totalReservesUsd": "100000000",
  "totalOutstanding": "1000000000000",
  "attestedBy": "9Ab2...def",
  "attestationUri": "https://example.com/audits/2026-03.pdf",
  "timestamp": "1709337600"
}
```

**Note:** `reserveHash` is a 32-element number array representing the SHA-256 hash bytes. `totalReservesUsd` is in USD cents. `totalOutstanding` is in token base units.

**Error: 404** if the attestation index does not exist.

---

## POST Endpoints

All POST endpoints return a transaction `signature` on success. Some return additional data.

### POST /initialize

Initialize a new stablecoin mint with the specified preset.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Token name (max 32 characters) |
| `symbol` | `string` | Yes | Token symbol (max 10 characters) |
| `uri` | `string` | Yes | Metadata URI (max 200 characters) |
| `decimals` | `number` | Yes | Decimal places (0-18) |
| `preset` | `string` | Yes | One of: `"sss1"`, `"sss2"`, `"sss3"`, `"custom"` |

**Example Request:**

```json
{
  "name": "USD Coin",
  "symbol": "USDC",
  "uri": "https://example.com/metadata.json",
  "decimals": 6,
  "preset": "sss2"
}
```

**Response: 201 Created**

```json
{
  "signature": "5Tx...abc",
  "mint": "7Kp3...xyz"
}
```

For SSS-2 presets, the backend automatically initializes the ExtraAccountMetaList in a follow-up transaction.

**Error: 400 Bad Request**

```json
{
  "error": {
    "code": -1,
    "name": "InvalidPreset",
    "message": "Invalid preset \"invalid\". Must be one of: sss1, sss2, sss3, custom"
  }
}
```

---

### POST /:mint/mint

Mint tokens to a recipient token account.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | `string` | Yes | Amount in base units (e.g., `"1000000000"` = 1000 USDC at 6 decimals) |
| `recipient` | `string` | Yes | Recipient's token account address (base58 pubkey) |

**Example Request:**

```json
{
  "amount": "1000000000",
  "recipient": "3Fg5...uvw"
}
```

**Response: 200 OK**

```json
{
  "signature": "4Sg...def"
}
```

**Possible Errors:** `ProgramPaused` (6002), `MinterNotActive` (6004), `MintQuotaExceeded` (6005), `MintAmountZero` (6006)

---

### POST /:mint/burn

Burn tokens from a token account owned by the server keypair.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | `string` | Yes | Amount in base units |
| `tokenAccount` | `string` | Yes | The token account to burn from (base58 pubkey) |

**Example Request:**

```json
{
  "amount": "500000000",
  "tokenAccount": "3Fg5...uvw"
}
```

**Response: 200 OK**

```json
{
  "signature": "2Rs...ghi"
}
```

**Possible Errors:** `ProgramPaused` (6002), `BurnAmountZero` (6007), `InsufficientBalance` (6008)

---

### POST /:mint/pause

Pause all mint and burn operations.

**Request Body:** None required.

**Response: 200 OK**

```json
{
  "signature": "7Uv...jkl"
}
```

**Possible Errors:** `Unauthorized` (6000), `ProgramPaused` (6002, already paused)

---

### POST /:mint/unpause

Resume operations after a pause.

**Request Body:** None required.

**Response: 200 OK**

```json
{
  "signature": "8Wx...mno"
}
```

**Possible Errors:** `Unauthorized` (6000), `ProgramNotPaused` (6003)

---

### POST /:mint/freeze

Freeze a token account.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tokenAccount` | `string` | Yes | The token account to freeze (base58 pubkey) |

**Example Request:**

```json
{
  "tokenAccount": "3Fg5...uvw"
}
```

**Response: 200 OK**

```json
{
  "signature": "9Yz...pqr"
}
```

**Possible Errors:** `Unauthorized` (6000)

---

### POST /:mint/thaw

Thaw a frozen token account.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tokenAccount` | `string` | Yes | The token account to thaw (base58 pubkey) |

**Example Request:**

```json
{
  "tokenAccount": "3Fg5...uvw"
}
```

**Response: 200 OK**

```json
{
  "signature": "1Ab...stu"
}
```

**Possible Errors:** `Unauthorized` (6000)

---

### POST /:mint/blacklist/add

Add an address to the blacklist and freeze their token account. SSS-2 only.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | `string` | Yes | The wallet address to blacklist (base58 pubkey) |
| `tokenAccount` | `string` | Yes | The target's token account (base58 pubkey) |
| `reason` | `string` | No | Reason for blacklisting (max 128 characters, defaults to `""`) |

**Example Request:**

```json
{
  "address": "Bad1...actor",
  "tokenAccount": "2Rt4...ghi",
  "reason": "OFAC SDN List - Entry 12345"
}
```

**Response: 200 OK**

```json
{
  "signature": "3Cd...vwx"
}
```

**Possible Errors:** `Unauthorized` (6000), `BlacklistNotEnabled` (6010), `AlreadyBlacklisted` (6013), `CannotBlacklistAuthority` (6015), `ReasonTooLong` (6019)

---

### POST /:mint/blacklist/remove

Remove an address from the blacklist and thaw their token account. SSS-2 only.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | `string` | Yes | The wallet address to remove from the blacklist (base58 pubkey) |
| `tokenAccount` | `string` | Yes | The target's token account (base58 pubkey) |

**Example Request:**

```json
{
  "address": "Bad1...actor",
  "tokenAccount": "2Rt4...ghi"
}
```

**Response: 200 OK**

```json
{
  "signature": "4Ef...yza"
}
```

**Possible Errors:** `Unauthorized` (6000), `BlacklistNotEnabled` (6010), `NotBlacklisted` (6014)

---

### POST /:mint/seize

Seize tokens from a blacklisted address via burn+mint. SSS-2 only.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `blacklistedAddress` | `string` | Yes | The blacklisted wallet address (base58 pubkey) |
| `from` | `string` | Yes | The blacklisted address's token account (base58 pubkey) |
| `to` | `string` | Yes | The treasury/destination token account (base58 pubkey) |
| `amount` | `string` | Yes | Amount to seize in base units |

**Example Request:**

```json
{
  "blacklistedAddress": "Bad1...actor",
  "from": "2Rt4...ghi",
  "to": "8Ks9...jkl",
  "amount": "500000000"
}
```

**Response: 200 OK**

```json
{
  "signature": "5Gh...bcd"
}
```

**Possible Errors:** `Unauthorized` (6000), `ProgramPaused` (6002), `MintAmountZero` (6006), `FeatureNotEnabled` (6009)

---

### POST /:mint/roles

Update a role assignment. Requires master authority.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | `string` | Yes | Role to update: `"pauser"`, `"blacklister"`, or `"seizer"` |
| `newHolder` | `string` | Yes | Public key of the new role holder (base58 pubkey) |

**Example Request:**

```json
{
  "role": "blacklister",
  "newHolder": "5Hj1...abc"
}
```

**Response: 200 OK**

```json
{
  "signature": "6Ij...efg"
}
```

**Possible Errors:** `Unauthorized` (6000), `InvalidAuthority` (6001)

---

### POST /:mint/minter

Create or update a minter configuration. Requires master authority.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `wallet` | `string` | Yes | The minter's wallet address (base58 pubkey) |
| `isActive` | `boolean` | Yes | Whether the minter is active |
| `quota` | `string` | Yes | Maximum mint allowance in base units (`"0"` = unlimited) |

**Example Request:**

```json
{
  "wallet": "6Lp8...stu",
  "isActive": true,
  "quota": "10000000000000"
}
```

**Response: 200 OK**

```json
{
  "signature": "7Kl...hij"
}
```

**Possible Errors:** `Unauthorized` (6000), `InvalidAuthority` (6001)

---

### POST /:mint/attest

Submit a reserve attestation. Requires master authority.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reserveHash` | `number[]` | Yes | SHA-256 hash as a 32-element byte array |
| `totalReservesUsd` | `string` | Yes | Total reserves in USD cents |
| `totalOutstanding` | `string` | Yes | Total outstanding stablecoins in base units |
| `attestationUri` | `string` | Yes | URI to the audit report (max 200 characters) |

**Example Request:**

```json
{
  "reserveHash": [161, 178, 195, 212, 229, 246, 7, 24, 41, 58, 75, 92, 109, 126, 143, 160, 177, 194, 211, 228, 245, 6, 23, 40, 57, 74, 91, 108, 125, 142, 159, 176],
  "totalReservesUsd": "100000000",
  "totalOutstanding": "1000000000000",
  "attestationUri": "https://example.com/audits/2026-03.pdf"
}
```

**Response: 200 OK**

```json
{
  "signature": "8Mn...klm"
}
```

**Possible Errors:** `Unauthorized` (6000), `InvalidAuthority` (6001), `UriTooLong` (6018), `Overflow` (6024)

---

## Error Code Reference

### sss-token Program Errors

| HTTP Status | Code | Name | Description |
|-------------|------|------|-------------|
| 403 | 6000 | Unauthorized | Caller does not have the required role |
| 403 | 6001 | InvalidAuthority | Invalid authority for this operation |
| 409 | 6002 | ProgramPaused | Program is currently paused |
| 409 | 6003 | ProgramNotPaused | Program is not paused (cannot unpause) |
| 403 | 6004 | MinterNotActive | Minter is not active |
| 400 | 6005 | MintQuotaExceeded | Mint amount exceeds minter quota |
| 400 | 6006 | MintAmountZero | Mint amount must be greater than zero |
| 400 | 6007 | BurnAmountZero | Burn amount must be greater than zero |
| 400 | 6008 | InsufficientBalance | Insufficient balance for burn |
| 400 | 6009 | FeatureNotEnabled | Feature not enabled for this preset |
| 400 | 6010 | BlacklistNotEnabled | Blacklist requires SSS-2 or higher |
| 400 | 6011 | TransferHookNotEnabled | Transfer hook requires SSS-2 |
| 400 | 6012 | ConfidentialTransfersNotEnabled | Confidential transfers require SSS-3 |
| 409 | 6013 | AlreadyBlacklisted | Address is already blacklisted |
| 404 | 6014 | NotBlacklisted | Address is not blacklisted |
| 400 | 6015 | CannotBlacklistAuthority | Cannot blacklist the master authority |
| 400 | 6016 | NameTooLong | Name exceeds 32 characters |
| 400 | 6017 | SymbolTooLong | Symbol exceeds 10 characters |
| 400 | 6018 | UriTooLong | URI exceeds 200 characters |
| 400 | 6019 | ReasonTooLong | Reason exceeds 128 characters |
| 400 | 6020 | DetailsTooLong | Details exceeds 256 characters |
| 400 | 6021 | InvalidDecimals | Invalid decimals value |
| 400 | 6022 | SameAuthority | Cannot transfer authority to same address |
| 400 | 6023 | ZeroAuthority | New authority cannot be the zero address |
| 500 | 6024 | Overflow | Arithmetic overflow |

### sss-transfer-hook Program Errors

| Code | Name | Description |
|------|------|-------------|
| 6000 | SourceBlacklisted | Source address is blacklisted (transfer rejected) |
| 6001 | DestinationBlacklisted | Destination address is blacklisted (transfer rejected) |

These errors occur during `transfer_checked` calls on SSS-2 mints and are not directly returned by the REST API. They appear in failed transaction logs when a user attempts to transfer tokens involving a blacklisted address.

## Endpoint Summary

| Method | Path | Description | Required Role |
|--------|------|-------------|---------------|
| GET | `/:mint` | Fetch config and roles | None |
| GET | `/:mint/minter/:address` | Fetch minter info | None |
| GET | `/:mint/blacklist/:address` | Check blacklist status | None |
| GET | `/:mint/attestation/:index` | Fetch attestation by index | None |
| POST | `/initialize` | Initialize new stablecoin | Deployer |
| POST | `/:mint/mint` | Mint tokens | Active minter |
| POST | `/:mint/burn` | Burn tokens | Token holder |
| POST | `/:mint/pause` | Pause operations | Pauser |
| POST | `/:mint/unpause` | Unpause operations | Pauser |
| POST | `/:mint/freeze` | Freeze token account | Master authority / Pauser |
| POST | `/:mint/thaw` | Thaw token account | Master authority / Pauser |
| POST | `/:mint/blacklist/add` | Add to blacklist | Blacklister |
| POST | `/:mint/blacklist/remove` | Remove from blacklist | Blacklister |
| POST | `/:mint/seize` | Seize tokens | Seizer |
| POST | `/:mint/roles` | Update role assignment | Master authority |
| POST | `/:mint/minter` | Configure minter | Master authority |
| POST | `/:mint/attest` | Submit reserve attestation | Master authority |
