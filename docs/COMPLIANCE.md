# Compliance Guide

## GENIUS Act Mappings

The S³ is designed to comply with the GENIUS (Guiding and Establishing National Innovation for U.S. Stablecoins) Act requirements.

### Reserve Transparency (Section 4)

- `totalMinted` and `totalBurned` tracked on-chain in the Config PDA
- Real-time supply auditable via `stablecoin.getTotalSupply()`

### Redemption Rights (Section 5)

- Burn instruction available to authorized minters
- Cannot be blocked when token is unpaused

### Risk Management (Section 6)

- **Pause capability**: Global emergency stop
- **Freeze capability**: Per-account freezing
- **Blacklist**: Per-address transfer blocking (S³-2)
- **Seizure**: Permanent delegate can recover tokens from sanctioned accounts

### AML/KYC Compliance (Section 7)

| Requirement | S³ Feature |
|-------------|-------------|
| Block sanctioned transfers | Transfer Hook + Blacklist PDAs |
| Freeze suspicious accounts | Freeze/Thaw instructions |
| Seize illicit funds | Permanent Delegate + Seize instruction |
| Audit trail | On-chain events for all state changes |
| KYC gate for privacy | Confidential transfer approval (S³-3) |

### Audit Trail

All significant actions emit on-chain events:

- `InitializeEvent` - Stablecoin creation
- `MintEvent` - Token minting
- `BurnEvent` - Token burning
- `BlacklistEvent` - Blacklist add/remove
- `SeizeEvent` - Token seizure
- `PauseEvent` - Pause/unpause
- `RoleEvent` - Role assignment/revocation
- `FreezeEvent` - Account freeze/thaw
- `OwnershipTransferEvent` - Ownership changes

## Preset Compliance Matrix

| Feature | S³-1 | S³-2 | S³-3 |
|---------|-------|-------|-------|
| Minting Control | Yes | Yes | Yes |
| Pause/Unpause | Yes | Yes | Yes |
| Freeze/Thaw | Yes | Yes | Yes |
| Transfer Blocking | No | Yes (hook) | No |
| Blacklisting | No | Yes | No |
| Asset Seizure | No | Yes | Yes (delegate) |
| Confidential Transfers | No | No | Yes |
| On-chain Audit Trail | Yes | Yes | Yes |

## Recommended Preset by Use Case

- **S³-1**: Non-regulated tokens, internal use
- **S³-2**: Fully regulated stablecoins (GENIUS Act compliant)
- **S³-3**: Privacy-preserving regulated stablecoins
