# Security

## Program verification checklist

No on-chain code changes; this checklist documents that the program enforces access control and consistency.

- **Role PDA / signer:** Each instruction requires the correct role account (PDA derived from stablecoin + holder) and signer. See `programs/sss-1/src/instructions/` (mint, burn, freeze, thaw, pause, blacklist, seize, update_roles, update_minter, etc.).
- **Mint/config consistency:** Initialize sets `enable_permanent_delegate`, `enable_transfer_hook`, `default_account_frozen` once; they are immutable.
- **SSS-2 compliance gating:** `add_to_blacklist`, `remove_from_blacklist` (`programs/sss-1/src/instructions/blacklist.rs`) and `seize` (`programs/sss-1/src/instructions/seize.rs`) check `stablecoin.is_sss2()` and return `StablecoinError::ComplianceNotEnabled` when compliance was not enabled at init. Error code: `programs/sss-1/src/error.rs` (e.g. 6002 ComplianceNotEnabled).
- **RBAC:** Mint requires minter role + minter info (quota); burn requires burner role; freeze/thaw require pauser or freezer; pause/unpause require pauser; blacklist requires blacklister; seize requires seizer; update_roles and update_minter require authority.

## Threat model

### Assumptions

- **Authority key security**: The stablecoin authority keypair is kept secure. Compromise of this key enables full control (roles, transfer authority, supply cap, pause).
- **RPC trust**: For reads, the RPC endpoint is trusted to return accurate on-chain state. Malicious RPC could serve stale or forged data.
- **Token-2022 and Anchor**: The SPL Token-2022 program and Anchor framework behave correctly. We do not assume our program is isolated from bugs in those dependencies.
- **No reentrancy**: Solana programs execute atomically; we do not expect reentrancy attacks.

### Threats

| Threat | Mitigation |
|--------|------------|
| Authority key compromise | Use hardware wallets, multisig, or timelock for production. No on-chain recovery. |
| Unauthorized mint/burn/seize | Role-based access: only minters can mint (within quota), only burners can burn, only seizers can seize. Authority grants roles. |
| Pause bypass | `mint_tokens` and `burn_tokens` check `stablecoin.paused` before any CPI. |
| Blacklist bypass | SSS-2 transfer hook checks blacklist on every transfer. No blacklist for SSS-1. |
| Arithmetic overflow | `checked_add` used for `total_minted`, `total_burned`, and minter quotas. |
| Supply cap bypass | Mint checks `SupplyCap` PDA when present. Cap = `u64::MAX` means no cap. |
| Invalid account substitution | Anchor constraints (seeds, address) enforce account identity. CPI uses program IDs. |

## Roles

| Role | Permissions |
|------|-------------|
| **Authority** | Update roles, transfer authority, update minter quota, update supply cap. |
| **Minter** | Mint tokens within per-minter quota. Requires `MinterInfo` with quota. |
| **Burner** | Burn tokens from own token account. |
| **Pauser** | Pause/unpause stablecoin. |
| **Freezer** | Freeze/thaw token accounts (pauser also has this capability for backward compatibility). |
| **Blacklister** (SSS-2 only) | Add/remove addresses from blacklist. |
| **Seizer** (SSS-2 only) | Seize full balance from a token account to a destination. |

The authority receives all roles at initialization. Roles can be granted or revoked via `update_roles` (authority only).

## Error codes

From `programs/sss-1/src/error.rs`:

| Code | Name | Message |
|------|------|---------|
| 6000 | Unauthorized | Caller lacks required role. |
| 6001 | Paused | Stablecoin is paused. |
| 6002 | ComplianceNotEnabled | Compliance module not enabled for this stablecoin. |
| 6003 | AlreadyBlacklisted | Address is already blacklisted. |
| 6004 | NotBlacklisted | Address is not blacklisted. |
| 6005 | QuotaExceeded | Minter quota exceeded. |
| 6006 | ZeroAmount | Amount must be greater than zero. |
| 6007 | NameTooLong | Name too long (max 32 characters). |
| 6008 | SymbolTooLong | Symbol too long (max 10 characters). |
| 6009 | UriTooLong | URI too long (max 200 characters). |
| 6010 | ReasonTooLong | Reason too long (max 100 characters). |
| 6011 | Blacklisted | Address is blacklisted. |
| 6012 | MathOverflow | Arithmetic overflow. |
| 6013 | InvalidRoleConfig | Invalid role configuration. |
| 6014 | SupplyCapExceeded | Supply cap exceeded. |

Anchor constraint violations (e.g. `ConstraintRaw` 0x7d3 / 2003) can also occur when account constraints fail before custom errors are reached.

## Recommendations

1. **Protect the authority key**: Use hardware wallets or multisig for production deployments.
2. **Monitor mints and burns**: Alert on unusual mint/burn volumes or new minter additions.
3. **Set supply caps**: Use `update_supply_cap` to limit total supply when desired.
4. **Use SSS-2 for compliance**: Enable transfer hook and blacklist for regulated deployments.
5. **Audit role grants**: Regularly review who has minter, burner, pauser, and freezer roles.
6. **Transfer authority**: The current authority can transfer authority to any address in a single step without the new authority signing. The new authority does not auto-receive roles. **Procedure:** Either (1) pre-grant roles to new authority via `update_roles`, then call `transfer_authority`; or (2) call `transfer_authority`, then new authority calls `update_roles` to grant themselves roles. Do not lose access to the old authority key until roles are granted.
